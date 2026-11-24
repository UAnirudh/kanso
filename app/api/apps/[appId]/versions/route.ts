import { z } from "zod";
import { readJson, withApi, json, assertSameOrigin } from "@/lib/api";
import { requireApiGuest } from "@/lib/identity";
import {
  interfaceHistory,
  resetInterfaceToBase,
  restoreInterfaceVersion,
  undoInterfaceChange,
} from "@/lib/interface/service";
import { requireAppAccess } from "@/lib/repo/apps";

const bodySchema = z.object({
  action: z.enum(["restore", "undo", "reset"]),
  revisionId: z.string().min(3).max(80).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    const guest = await requireApiGuest();
    const { appId } = await params;
    const access = requireAppAccess(appId, guest.id);
    return json({ history: interfaceHistory(access, guest.id) });
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
    const body = await readJson(request, bodySchema);

    const saved =
      body.action === "undo"
        ? undoInterfaceChange({ access, userId: guest.id })
        : body.action === "reset"
          ? resetInterfaceToBase({ access, userId: guest.id })
          : restoreInterfaceVersion({
              access,
              userId: guest.id,
              revisionId: body.revisionId ?? "",
            });

    return json({ document: saved.document, revisionId: saved.revisionId });
  });
}
