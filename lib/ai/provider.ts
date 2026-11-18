/**
 * Provider-independent completion adapter.
 *
 * Groq speaks the OpenAI-compatible chat completions protocol, so swapping in
 * another provider means implementing `completeChat` for that protocol. The
 * model id is configuration, never hard-coded into the pipeline.
 */

export const DEFAULT_GROQ_MODEL = "qwen/qwen3-32b";

/** Model ids verified against Groq's docs and SDK type definitions. */
export const KNOWN_GROQ_MODELS = [
  "qwen/qwen3-32b",
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "moonshotai/kimi-k2-instruct",
] as const;

export type ProviderKind = "model" | "local";

export interface ProviderInfo {
  provider: string;
  model: string;
  kind: ProviderKind;
}

export type AiErrorKind = "config" | "timeout" | "rate_limited" | "upstream" | "invalid_output";

export class AiProviderError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;

  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
    this.status = status;
  }
}

export function providerInfo(): ProviderInfo {
  const key = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  if (key) return { provider: "groq", model, kind: "model" };
  return { provider: "local-planner", model: "deterministic-rules-v1", kind: "local" };
}

export interface ChatCompletionResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
}

interface GroqCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export async function completeChat(input: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatCompletionResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new AiProviderError("config", "GROQ_API_KEY is not configured.");
  }

  const baseUrl = (process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(
    /\/$/,
    "",
  );
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 25000);
  const started = Date.now();

  let lastError: AiProviderError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 1400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        }),
        signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 25000),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as GroqCompletionResponse;
        const message =
          body.error?.message ??
          `Groq returned ${response.status} ${response.statusText}`.trim();
        if (response.status === 429) {
          throw new AiProviderError("rate_limited", message, 429);
        }
        if (response.status >= 500 && attempt === 0) {
          lastError = new AiProviderError("upstream", message, response.status);
          await new Promise((resolve) => setTimeout(resolve, 400));
          continue;
        }
        throw new AiProviderError("upstream", message, response.status);
      }

      const body = (await response.json()) as GroqCompletionResponse;
      const text = body.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        throw new AiProviderError("invalid_output", "The model returned an empty response.");
      }
      return {
        text,
        tokensIn: body.usage?.prompt_tokens ?? 0,
        tokensOut: body.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - started,
        model,
      };
    } catch (error) {
      if (error instanceof AiProviderError) {
        if (error.kind === "rate_limited" || error.kind === "invalid_output") throw error;
        lastError = error;
        if (attempt === 1) break;
        continue;
      }
      const isAbort =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      lastError = new AiProviderError(
        isAbort ? "timeout" : "upstream",
        isAbort
          ? "The model took too long to respond. Nothing was changed."
          : `Could not reach the model: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      if (attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError ?? new AiProviderError("upstream", "The model request failed.");
}

export function aiEnabled(): boolean {
  return providerInfo().kind === "model";
}
