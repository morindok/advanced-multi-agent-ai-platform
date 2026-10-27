import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

/** طرح یک پروژه‌ی قابل اجرا که معمار مغز تعیین می‌کند */
export type ProjectPlan = {
  name: string;
  kind: "web" | "node";
  entry: string;
  files: { path: string; purpose: string }[];
};

export type Issue = { file: string; msg: string };

export const PROJECTS_ROOT = path.join(process.cwd(), "workspace", "projects");

export function projectDir(runId: number) {
  return path.join(PROJECTS_ROOT, String(runId));
}

/** مسیر نسبی امن: بدون .. ، بدون ریشه‌ی مطلق، بدون نقطه‌فایل */
export function safeRel(p: string): string | null {
  const n = p.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!n || n.length > 180) return null;
  if (n.split("/").some((s) => !s || s === ".." || s.startsWith("."))) return null;
  if (!/^[\w\-./@]+$/.test(n)) return null;
  return n;
}

export async function writeProjectFile(runId: number, rel: string, content: string) {
  const safe = safeRel(rel);
  if (!safe) throw new Error(`مسیر نامعتبر: ${rel}`);
  const full = path.join(projectDir(runId), safe);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
}

export async function readProjectFile(runId: number, rel: string): Promise<string | null> {
  const safe = safeRel(rel);
  if (!safe) return null;
  try {
    return await fs.readFile(path.join(projectDir(runId), safe), "utf8");
  } catch {
    return null;
  }
}

export async function listProjectFiles(runId: number): Promise<string[]> {
  const root = projectDir(runId);
  const out: string[] = [];
  async function walk(dir: string, prefix: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), rel);
      else out.push(rel);
    }
  }
  await walk(root, "");
  return out.sort();
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

export function mimeOf(rel: string) {
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

const PLACEHOLDER = /\/\/\s*\.\.\.|\/\*\s*\.\.\.\s*\*\/|<!--\s*\.\.\.\s*-->|\bTODO\b[^\n]{0,30}implement/i;

/** آیا فایل کامل و قابل‌اجراست، یا وسط کار قطع شده؟ */
export function fileComplete(rel: string, content: string): boolean {
  const c = content.trim();
  if (c.length < 40) return false;
  if (/\.html?$/i.test(rel)) {
    const open = (c.match(/<script\b/gi) ?? []).length;
    const close = (c.match(/<\/script>/gi) ?? []).length;
    return /<\/html>/i.test(c) && open === close && open > 0;
  }
  if (/\.(c|m)?js$/i.test(rel)) return syntaxError(c, rel) === null;
  if (/\.json$/i.test(rel)) {
    try {
      JSON.parse(c);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

function syntaxError(code: string, name: string): string | null {
  try {
    new vm.Script(code, { filename: name });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * اعتبارسنجی واقعی پروژه: وجود فایل‌ها، نحو JavaScript (فایل‌ها و اسکریپت‌های داخلی HTML)،
 * JSON، ارجاع‌های محلی HTML و جای‌نگهدارهای باقی‌مانده.
 */
export async function verifyProject(runId: number, plan: ProjectPlan): Promise<Issue[]> {
  const dir = projectDir(runId);
  const issues: Issue[] = [];
  const exists = async (rel: string) => {
    try {
      await fs.access(path.join(dir, rel));
      return true;
    } catch {
      return false;
    }
  };

  if (!(await exists(plan.entry))) issues.push({ file: plan.entry, msg: "نقطه‌ی ورود وجود ندارد" });

  for (const f of plan.files) {
    const rel = f.path;
    if (!(await exists(rel))) {
      issues.push({ file: rel, msg: "فایل تولید نشده است" });
      continue;
    }
    const code = await fs.readFile(path.join(dir, rel), "utf8");
    if (code.trim().length < 30) {
      issues.push({ file: rel, msg: "محتوای فایل خالی یا ناقص است" });
      continue;
    }
    if (PLACEHOLDER.test(code)) {
      issues.push({ file: rel, msg: "جای‌نگهدار در کد باقی مانده؛ باید کامل پیاده‌سازی شود" });
    }
    if (/\.(c|m)?js$/.test(rel)) {
      const err = syntaxError(code, rel);
      if (err) issues.push({ file: rel, msg: `خطای نحوی JavaScript: ${err}` });
    }
    if (rel.endsWith(".json")) {
      try {
        JSON.parse(code);
      } catch (e) {
        issues.push({ file: rel, msg: `JSON نامعتبر: ${(e as Error).message}` });
      }
    }
    if (plan.kind === "web" && /\.tsx?$/.test(rel)) {
      issues.push({ file: rel, msg: "TypeScript در مرورگر اجرا نمی‌شود. منطق را به JavaScript کلاسیک (بدون import/export) منتقل کن و در index.html وصل کن." });
    }
    if (/\.html?$/.test(rel)) {
      const openScripts = (code.match(/<script\b/gi) ?? []).length;
      const closeScripts = (code.match(/<\/script>/gi) ?? []).length;
      if (openScripts !== closeScripts) {
        issues.push({ file: rel, msg: "تگ script بسته نشده — فایل وسط کد قطع شده و دکمهٔ اجرا هیچ بازی‌ای را بالا نمی‌آورد. فایل را تا </html> کامل کن." });
      }
      if (!/<\/html>/i.test(code)) {
        issues.push({ file: rel, msg: "HTML ناقص است و با </html> تمام نشده. خروجی قطع‌شده قابل اجرا نیست." });
      }
      if (plan.kind === "web" && !/<script\b/i.test(code)) {
        issues.push({ file: rel, msg: "هیچ اسکریپتی در صفحه نیست؛ برنامه بوت نمی‌شود." });
      }
      const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
      let m: RegExpExecArray | null;
      while ((m = scriptRe.exec(code))) {
        const attrs = m[1];
        if (/\ssrc\s*=/.test(attrs) || /type\s*=\s*["']module["']/i.test(attrs)) continue;
        const err = syntaxError(m[2], `${rel} (inline)`);
        if (err) issues.push({ file: rel, msg: `خطای نحوی در اسکریپت داخلی: ${err}` });
      }
      const refs = [...code.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)]
        .map((x) => x[1])
        .filter((r) => !/^(https?:|\/\/|data:|mailto:|javascript:)/i.test(r));
      for (const ref of refs) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), ref.replace(/^\/+/, "")));
        if (target.startsWith("..")) continue;
        if (!(await exists(target))) issues.push({ file: target, msg: `ارجاع به فایل ناموجود از ${rel}` });
      }
    }
  }
  return issues;
}

export function buildReadme(plan: ProjectPlan, runId: number, issues: Issue[]): string {
  const howTo =
    plan.kind === "web"
      ? `1. پوشه‌ی ZIP را خارج کنید.\n2. فایل **${plan.entry}** را با مرورگر باز کنید (دوبار کلیک).\n\nنیازی به نصب، سرور یا مرحله‌ی build نیست.`
      : `1. Node.js 18 یا بالاتر نصب کنید.\n2. در پوشه‌ی پروژه اجرا کنید: \`node ${plan.entry}\``;
  const files = plan.files.map((f) => `- \`${f.path}\` — ${f.purpose}`).join("\n");
  const status = issues.length
    ? issues.map((i) => `- ⚠ ${i.file}: ${i.msg}`).join("\n")
    : "✓ همه‌ی فایل‌ها بررسی شده‌اند و خطای نحوی یا ارجاع شکسته ندارند.";
  return `# ${plan.name}\n\nساخته‌شده توسط مغز NCP — اجرای #${runId}\n\n## اجرا\n${howTo}\n\n## فایل‌ها\n${files}\n\n## وضعیت اعتبارسنجی\n${status}\n`;
}
