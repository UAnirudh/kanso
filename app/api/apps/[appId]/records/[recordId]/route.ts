import { withApi, json } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { badRequest, forbidden } from "@/lib/errors";
import { requireAppAccess } from "@/lib/repo/apps";
import { deleteRecord, taskUpdateSchema, updateTask } from "@/lib/repo/records";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string; recordId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { appId, recordId } = await params;
    const access = requireAppAccess(appId, user.id);
    if (!access.canEdit) throw forbidden("Your role is view-only.");

    const body = await request.json().catch(() => null);
    if (!body) throw badRequest("Expected a JSON body.");
    const patch = taskUpdateSchema.parse(body);
    const record = updateTask(access.app.id, recordId, patch);
    return json({ record });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ appId: string; recordId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { appId, recordId } = await params;
    const access = requireAppAccess(appId, user.id);
    if (!access.canEdit) throw forbidden("Your role is view-only.");
    deleteRecord(access.app.id, recordId);
    return json({ ok: true });
  });
}
