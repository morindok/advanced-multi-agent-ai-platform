import fs from "node:fs/promises";
import path from "node:path";
import { listProjectFiles, projectDir } from "@/lib/meta/project";
import { buildZip } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** دانلود کل پروژه به‌صورت ZIP (همه‌ی فایل‌ها + README) */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const id = Number((await ctx.params).runId);
  if (!Number.isInteger(id) || id <= 0) return new Response("not found", { status: 404 });
  const files = await listProjectFiles(id);
  if (!files.length) return new Response("پروژه‌ای یافت نشد", { status: 404 });

  const entries = await Promise.all(
    files.map(async (f) => ({ name: f, data: await fs.readFile(path.join(projectDir(id), f)) })),
  );
  const zip = buildZip(entries);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="project-${id}.zip"`,
    },
  });
}
