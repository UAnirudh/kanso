import { z } from "zod";
import { readJson, withApi, json, assertSameOrigin } from "@/lib/api";
import { requireApiGuest } from "@/lib/identity";
import { operationSchema } from "@/lib/interface/operations";
import { applyInterfaceOperations } from "@/lib/interface/service";
import { requireAppAccess } from "@/lib/repo/apps";

const bodySchema = z.object({
  operations: z.array(operationSchema).min(1).max(8),
  label: z.string().max(120).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    assertSameOrigin(request);
    const guest = await requireApiGuest();
    const { appId } = await params;
    const access = requireAppAccess(appId, guest.id);
    const body = await readJson(request, bodySchema);

    const saved = applyInterfaceOperations({
      access,
      userId: guest.id,
      operations: body.operations,
      label: body.label ?? "Visual edit",
      kind: "manual",
    });

    return json({
      document: saved.document,
      revisionId: saved.revisionId,
      warnings: saved.warnings,
    });
  });
}
