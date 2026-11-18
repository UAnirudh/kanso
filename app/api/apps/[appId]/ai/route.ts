import { withApi, json } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { proposeInterfaceChange } from "@/lib/ai/pipeline";
import { requireAppAccess } from "@/lib/repo/apps";
import { listAiRequests } from "@/lib/repo/ai";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    const user = await requireApiUser();
    const { appId } = await params;
    const access = requireAppAccess(appId, user.id);
    return json({ requests: listAiRequests(access.app.id, user.id) });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { appId } = await params;
    const access = requireAppAccess(appId, user.id);

    const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";

    const proposal = await proposeInterfaceChange({
      access,
      userId: user.id,
      prompt,
    });
    return json({ proposal });
  });
}
