import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Used by the Docker HEALTHCHECK and the Render health check. */
export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return Response.json(
      { ok: true, db: "up" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] database unavailable", error);
    return Response.json(
      { ok: false, db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
