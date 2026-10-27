import { db } from "@/db";
import { tools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bootstrap } from "@/lib/meta/config";
import { ensureToolsSeeded, execTool, listTools } from "@/lib/meta/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await bootstrap();
  const rows = await listTools();
  return Response.json({ tools: rows });
}

/** ساخت/ویرایش ابزار توسط کاربر یا جن (خودبرنامه‌نویسی) + فعال/غیرفعال‌سازی */
export async function POST(req: Request) {
  await ensureToolsSeeded();
  const body = (await req.json()) as {
    action?: "synthesize" | "toggle" | "delete" | "exec";
    id?: number;
    key?: string;
    name?: string;
    description?: string;
    category?: string;
    risk?: string;
    params?: unknown[];
    source?: string;
    enabled?: boolean;
    args?: Record<string, unknown>;
  };

  if (body.action === "toggle" && body.id) {
    const [row] = await db.select().from(tools).where(eq(tools.id, body.id));
    if (!row) return Response.json({ ok: false }, { status: 404 });
    await db.update(tools).set({ enabled: !row.enabled }).where(eq(tools.id, body.id));
    return Response.json({ ok: true, enabled: !row.enabled });
  }
  if (body.action === "delete" && body.id) {
    const [row] = await db.select().from(tools).where(eq(tools.id, body.id));
    if (row && !row.builtin) await db.delete(tools).where(eq(tools.id, body.id));
    return Response.json({ ok: true });
  }
  if (body.action === "exec" && body.key) {
    const res = await execTool(body.key, body.args ?? {});
    return Response.json(res);
  }
  if (body.action === "synthesize" || body.source) {
    const res = await execTool("tool.synthesize", {
      key: body.key,
      name: body.name,
      description: body.description,
      category: body.category ?? "synthesized",
      risk: body.risk ?? "medium",
      params: body.params ?? [],
      source: body.source,
    });
    return Response.json(res, { status: res.ok ? 200 : 400 });
  }
  return Response.json({ ok: false, error: "action نامعتبر" }, { status: 400 });
}
