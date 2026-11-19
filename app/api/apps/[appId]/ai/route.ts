import { withApi, json, assertSameOrigin } from "@/lib/api";
import { requireApiGuest } from "@/lib/identity";
import { proposeInterfaceChange } from "@/lib/ai/pipeline";
import { requireAppAccess } from "@/lib/repo/apps";
import { listAiRequests } from "@/lib/repo/ai";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    const guest = await requireApiGuest();
    const { appId } = await params;
    const access = requireAppAccess(appId, guest.id);
    return json({ requests: listAiRequests(access.app.id, guest.id) });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const guest = await requireApiGuest();
    const { appId } = await params;
    const access = requireAppAccess(appId, guest.id);

    const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";

    const proposal = await proposeInterfaceChange({
      access,
      userId: guest.id,
      prompt,
    });
    return json({ proposal });
  });
}
