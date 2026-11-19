import { z } from "zod";
import { withApi, json, assertSameOrigin } from "@/lib/api";
import { requireApiGuest } from "@/lib/identity";
import { badRequest, forbidden } from "@/lib/errors";
import { requireAppAccess } from "@/lib/repo/apps";
import {
  createNote,
  createTask,
  listRecords,
  noteCreateSchema,
  taskCreateSchema,
} from "@/lib/repo/records";

const kindSchema = z.enum(["task", "note"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    const guest = await requireApiGuest();
    const { appId } = await params;
    const access = requireAppAccess(appId, guest.id);
    return json({
      tasks: listRecords(access.app.id, "task"),
      notes: listRecords(access.app.id, "note"),
    });
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
    if (!access.canEdit) {
      throw forbidden("Your role is view-only, so you cannot add records here.");
    }

    const body = (await request.json().catch(() => null)) as
      | (Record<string, unknown> & { kind?: unknown })
      | null;
    if (!body) throw badRequest("Expected a JSON body.");

    const kind = kindSchema.parse(body.kind);
    if (kind === "task") {
      const data = taskCreateSchema.parse(body);
      const record = createTask({ appId: access.app.id, userId: guest.id, data });
      return json({ record }, 201);
    }
    const data = noteCreateSchema.parse(body);
    const record = createNote({ appId: access.app.id, userId: guest.id, data });
    return json({ record }, 201);
  });
}
