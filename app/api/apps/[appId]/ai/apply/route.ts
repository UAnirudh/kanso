import { z } from "zod";
import { readJson, withApi, json } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { applyProposal, discardProposal } from "@/lib/ai/pipeline";
import { requireAppAccess } from "@/lib/repo/apps";

const bodySchema = z.object({
  requestId: z.string().min(3).max(80),
  action: z.enum(["apply", "discard"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { appId } = await params;
    const access = requireAppAccess(appId, user.id);
    const body = await readJson(request, bodySchema);

    if (body.action === "discard") {
      discardProposal({ access, userId: user.id, requestId: body.requestId });
      return json({ ok: true });
    }

    const saved = applyProposal({ access, userId: user.id, requestId: body.requestId });
    return json({ document: saved.document, revisionId: saved.revisionId });
  });
}
