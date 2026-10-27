import fs from "node:fs/promises";
import path from "node:path";
import { mimeOf, projectDir, safeRel } from "@/lib/meta/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** سرو فایل‌های پروژه‌ی ساخته‌شده برای اجرای مستقیم در مرورگر */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string; path: string[] }> }) {
  const { runId, path: parts } = await ctx.params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) return new Response("not found", { status: 404 });

  const rel = safeRel((parts ?? []).join("/") || "index.html");
  if (!rel) return new Response("bad path", { status: 400 });

  const root = projectDir(id);
  const full = path.join(root, rel);
  if (!full.startsWith(root + path.sep)) return new Response("forbidden", { status: 403 });

  try {
    let data: Buffer = await fs.readFile(full);
    if (/\.html?$/i.test(rel)) {
      const banner = `<script>window.addEventListener("error",function(e){function show(){var d=document.getElementById("ncp-boot-error")||document.createElement("div");d.id="ncp-boot-error";d.setAttribute("style","position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;background:#2a0d14;color:#ffd0d8;border:1px solid #ff6b81;border-radius:10px;padding:12px 14px;font:14px/1.7 system-ui,Tahoma;direction:rtl");d.textContent="این صفحه خطا داد و اجرا نشد: "+(e.message||"خطای ناشناخته");(document.body||document.documentElement).appendChild(d);} if(document.body) show(); else document.addEventListener("DOMContentLoaded",show);});</script>`;
      let html = data.toString("utf8");
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + banner) : banner + html;
      data = Buffer.from(html, "utf8");
    }
    return new Response(data as unknown as BodyInit, {
      headers: {
        "Content-Type": mimeOf(rel),
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
