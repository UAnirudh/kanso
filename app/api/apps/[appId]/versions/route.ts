import { z } from "zod";
import { readJson, withApi, json } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import {
  interfaceHistory,
  restoreInterfaceVersion,
  undoInterfaceChange,
} from "@/lib/interface/service";
import { requireAppAccess } from "@/lib/repo/apps";

const bodySchema = z.object({
  action: z.enum(["restore", "undo"]),
  revisionId: z.string().min(3).max(80).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    const user = await requireApiUser();
    const { appId } = await params;
    const access = requireAppAccess(appId, user.id);
    return json({ history: interfaceHistory(access, user.id) });
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
    const body = await readJson(request, bodySchema);

    const saved =
      body.action === "undo"
        ? undoInterfaceChange({ access, userId: user.id })
        : restoreInterfaceVersion({
            access,
            userId: user.id,
            revisionId: body.revisionId ?? "",
          });

    return json({ document: saved.document, revisionId: saved.revisionId });
  });
}
