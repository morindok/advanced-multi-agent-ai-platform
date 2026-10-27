import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * دریافت یک اثر.
 * ?merged=1 → برای سند مادر، همه‌ی بخش‌های فرزند را به‌صورت یک سند واحد بازمی‌گرداند.
 * ?download=1 → با هدرهای دانلود.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const id = Number((await ctx.params).id);
  const url = new URL(req.url);
  const merged = url.searchParams.get("merged") === "1";
  const download = url.searchParams.get("download") === "1";

  const [row] = await db.select().from(artifacts).where(eq(artifacts.id, id));
  if (!row) return Response.json({ error: "اثر یافت نشد" }, { status: 404 });

  let content = row.content;
  let children: { id: number; title: string; bytes: number }[] = [];
  if (merged || row.kind === "blueprint") {
    const kids = await db.select().from(artifacts).where(eq(artifacts.parentId, id)).orderBy(asc(artifacts.id));
    children = kids.map((k) => ({ id: k.id, title: k.title, bytes: k.bytes }));
    if (merged) content = [row.content, ...kids.map((k) => `\n\n---\n\n${k.content}`)].join("\n");
  }

  if (download) {
    const mime = row.mime ?? (row.kind === "html" ? "text/html" : row.kind === "json" ? "application/json" : "text/markdown");
    return new Response(content, {
      headers: {
        "Content-Type": `${mime}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="artifact-${id}.md"`,
      },
    });
  }
  return Response.json({ ...row, content, children, chars: content.length });
}
