import { z } from "zod";
import { applyOperations, InterfaceValidationError } from "../interface/engine";
import { operationSchema, operationsEnvelopeSchema } from "../interface/operations";
import { applyInterfaceOperations, loadInterface } from "../interface/service";
import type { AppAccess } from "../repo/apps";
import {
  consumeAiBudget,
  getAiRequest,
  insertAiRequest,
  setAiRequestStatus,
} from "../repo/ai";
import { badRequest, HttpError, notFound, tooManyRequests } from "../errors";
import { assertDailyTokenBudget } from "./budget";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from "./prompt";
import { AiProviderError, completeChat, providerInfo } from "./provider";
import { LocalPlannerError, planLocally } from "./local-planner";
import type { InterfaceDocument } from "../interface/types";
import type { InterfaceOperation } from "../interface/operations";

export interface ProposalView {
  id: string;
  summary: string;
  message: string;
  operations: InterfaceOperation[];
  warnings: string[];
  proposedDocument: InterfaceDocument;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new HttpError(422, "The model did not return JSON.");
  }
}

function parseEnvelope(text: string) {
  const raw = extractJson(text);
  const parsed = operationsEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(422, `The proposed change was malformed (${issues}).`);
  }
  return parsed.data;
}

function mapAiError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof AiProviderError) {
    switch (error.kind) {
      case "timeout":
        return new HttpError(504, error.message);
      case "rate_limited":
        return new HttpError(429, "The model provider is rate limiting us. Try again in a moment.");
      case "config":
        return new HttpError(500, "AI is not configured on the server.");
      case "invalid_output":
        return new HttpError(422, error.message);
      default:
        return new HttpError(502, error.message);
    }
  }
  if (error instanceof InterfaceValidationError) {
    return new HttpError(422, error.message, error.details);
  }
  if (error instanceof LocalPlannerError) {
    return new HttpError(422, error.message, error.hints);
  }
  if (error instanceof z.ZodError) {
    return new HttpError(422, "The proposed change failed validation.", error.issues.map((issue) => issue.message));
  }
  console.error("[ai] unexpected failure", error);
  return new HttpError(500, "The interface assistant hit an unexpected error. Your interface is unchanged.");
}

export async function proposeInterfaceChange(input: {
  access: AppAccess;
  userId: string;
  prompt: string;
}): Promise<ProposalView> {
  const prompt = input.prompt.trim();
  if (prompt.length < 3) throw badRequest("Describe the change in a few words.");
  if (prompt.length > 600) throw badRequest("Keep the request under 600 characters.");

  const budget = Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 8);
  if (!consumeAiBudget(input.userId, Number.isFinite(budget) ? budget : 8)) {
    throw tooManyRequests("You have made a lot of interface edits in the last minute. Wait a few seconds.");
  }

  const info = providerInfo();
  // The per-minute window above is keyed by user, and identity is a cookie: a new
  // cookie is a new budget. This ceiling is global, so it is the only thing that caps
  // what one visitor can spend on the owner's provider account. It runs before the
  // document is loaded, so a refused request costs nothing and changes nothing.
  // The local planner is free, so a key-less deployment is never blocked by it.
  if (info.kind === "model") assertDailyTokenBudget();

  const { document, pages, pageKeys } = loadInterface(input.access, input.userId);
  const started = Date.now();

  let tokensIn = 0;
  let tokensOut = 0;
  let summary = "";
  let message = "";
  let operations: InterfaceOperation[] = [];
  let proposed: InterfaceDocument | null = null;
  let warnings: string[] = [];

  try {
    if (info.kind === "local") {
      const plan = planLocally({
        prompt,
        document,
        pageTitles: Object.fromEntries(pages.map((page) => [page.key, page.title])),
      });
      summary = plan.summary;
      message = plan.message;
      operations = plan.operations;
    } else {
      const system = buildSystemPrompt();
      const user = buildUserPrompt({
        document,
        pages,
        prompt,
        role: input.access.role,
      });

      let envelope;
      const first = await completeChat({ system, user });
      tokensIn += first.tokensIn;
      tokensOut += first.tokensOut;

      try {
        envelope = parseEnvelope(first.text);
      } catch (parseError) {
        // One repair attempt with the validation error fed back. No more.
        const repair = await completeChat({
          system,
          user: buildRepairPrompt({
            previousOutput: first.text,
            error: parseError instanceof Error ? parseError.message : "invalid JSON",
            originalPrompt: prompt,
          }),
          temperature: 0,
        });
        tokensIn += repair.tokensIn;
        tokensOut += repair.tokensOut;
        envelope = parseEnvelope(repair.text);
      }

      summary = envelope.summary;
      message = envelope.message;
      operations = envelope.operations as InterfaceOperation[];
    }

    const result = applyOperations(document, operations, { pageKeys });
    proposed = result.document;
    warnings = result.warnings;

    if (JSON.stringify(proposed) === JSON.stringify(document)) {
      throw new HttpError(422, "That is already the case — nothing would change.");
    }

    const id = insertAiRequest({
      appId: input.access.app.id,
      userId: input.userId,
      prompt,
      provider: info.provider,
      model: info.model,
      status: "proposed",
      summary,
      message,
      operations,
      warnings,
      proposedDocument: JSON.stringify(proposed),
      baseDocument: JSON.stringify(document),
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
    });

    return {
      id,
      summary,
      message,
      operations,
      warnings,
      proposedDocument: proposed,
      provider: info.provider,
      model: info.model,
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
    };
  } catch (error) {
    const mapped = mapAiError(error);
    insertAiRequest({
      appId: input.access.app.id,
      userId: input.userId,
      prompt,
      provider: info.provider,
      model: info.model,
      status: "failed",
      summary,
      message,
      operations,
      warnings,
      error: mapped.message,
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
    });
    throw mapped;
  }
}

export function applyProposal(input: {
  access: AppAccess;
  userId: string;
  requestId: string;
}) {
  const request = getAiRequest(input.requestId);
  if (!request || request.appId !== input.access.app.id || request.userId !== input.userId) {
    throw notFound("That proposal no longer exists.");
  }
  if (request.status !== "proposed") {
    throw badRequest("This proposal was already applied or discarded.");
  }
  if (!request.proposedDocument) throw badRequest("That proposal has no interface attached.");

  const { document } = loadInterface(input.access, input.userId);
  if (request.baseDocument !== JSON.stringify(document)) {
    throw new HttpError(
      409,
      "Your interface changed after this preview was generated. Ask for the change again so it applies to the current layout.",
    );
  }

  const parsed = z.array(operationSchema).safeParse(request.operations);
  if (!parsed.success) throw badRequest("The stored proposal is no longer valid.");

  const saved = applyInterfaceOperations({
    access: input.access,
    userId: input.userId,
    operations: parsed.data as InterfaceOperation[],
    label: request.summary || "Assistant change",
    kind: "ai",
    aiRequestId: request.id,
  });
  setAiRequestStatus(request.id, "applied");
  return saved;
}

export function discardProposal(input: {
  access: AppAccess;
  userId: string;
  requestId: string;
}): void {
  const request = getAiRequest(input.requestId);
  if (!request || request.appId !== input.access.app.id || request.userId !== input.userId) {
    throw notFound("That proposal no longer exists.");
  }
  setAiRequestStatus(request.id, "discarded");
}
