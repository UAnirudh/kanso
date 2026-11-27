import { withApi } from "@/lib/api";
import { requireApiGuest } from "@/lib/identity";
import { requireAppAccess, getPages } from "@/lib/repo/apps";
import { listRecords } from "@/lib/repo/records";

/**
 * Read-only per-app data export: app metadata, pages, tasks and notes as one JSON
 * file a member can keep. It deliberately excludes other users' interface documents
 * and AI audit rows — this is the shared data, not a full database dump (use
 * `npm run db:backup` for that). Membership is resolved server-side like every other
 * app route, and a viewer may export because exported data is only what they can
 * already read.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  return withApi(async () => {
    const guest = await requireApiGuest();
    const { appId } = await params;
    const access = requireAppAccess(appId, guest.id);

    const payload = {
      exportedAt: new Date().toISOString(),
      app: access.app,
      pages: getPages(access.app.id),
      tasks: listRecords(access.app.id, "task"),
      notes: listRecords(access.app.id, "note"),
    };

    const slug =
      access.app.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "app";

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="kanso-${slug}-${access.app.id}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
