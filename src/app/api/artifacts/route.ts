import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await bootstrap();
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const sessionId = url.searchParams.get("sessionId");
  const q = runId ? eq(artifacts.runId, Number(runId)) : sessionId ? eq(artifacts.sessionId, sessionId) : undefined;
  const rows = await db
    .select({
      id: artifacts.id, runId: artifacts.runId, sessionId: artifacts.sessionId, kind: artifacts.kind,
      title: artifacts.title, lang: artifacts.lang, bytes: artifacts.bytes, url: artifacts.url,
      version: artifacts.version, parentId: artifacts.parentId, meta: artifacts.meta, createdAt: artifacts.createdAt,
    })
    .from(artifacts)
    .where(q)
    .orderBy(desc(artifacts.id))
    .limit(500);
  const [total] = await db.select({ sum: artifacts.bytes }).from(artifacts).where(q);
  return Response.json({ artifacts: rows, totalBytes: total?.sum ?? 0 });
}
