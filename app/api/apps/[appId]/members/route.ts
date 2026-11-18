import { z } from "zod";
import { readJson, withApi, json } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { forbidden } from "@/lib/errors";
import { requireAppAccess } from "@/lib/repo/apps";
import { listMembers, removeMember, updateMemberRole } from "@/lib/repo/workspaces";

const roleSchema = z.enum(["owner", "admin", "member", "viewer"]);

const patchSchema = z.object({
  userId: z.string().min(3),
  role: roleSchema,
});

const deleteSchema = z.object({ userId: z.string().min(3) });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    const user = await requireApiUser();
    const { appId } = await params;
    const access = requireAppAccess(appId, user.id);
    return json({ members: listMembers(access.workspace.id) });
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { appId } = await params;
    const access = requireAppAccess(appId, user.id);
    if (!access.canManage) throw forbidden("Only workspace admins can change roles.");

    const body = await readJson(request, patchSchema);
    updateMemberRole(access.workspace.id, body.userId, body.role);
    return json({ ok: true });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { appId } = await params;
    const access = requireAppAccess(appId, user.id);
    if (!access.canManage) throw forbidden("Only workspace admins can remove members.");

    const body = await readJson(request, deleteSchema);
    removeMember(access.workspace.id, body.userId);
    return json({ ok: true });
  });
}
