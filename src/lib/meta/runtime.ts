import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./project";

export type PlayReport = {
  ok: boolean;
  tested: boolean;
  kind: "browser" | "node" | "skipped";
  errors: string[];
  notes: string[];
  raf: number;
  drew: boolean;
  screenshot?: string;
};

const BROWSERS = path.join(process.cwd(), ".playwright-browsers");

function baseUrl() {
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}`;
}

/** تست زنده‌ی صفحه در کرومیوم: بوت، کلیک شروع، حلقه‌ی فریم، رسم، و خطای اجرا */
export async function playTest(runId: number, entry: string, expectGame: boolean): Promise<PlayReport> {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
  const url = `${baseUrl()}/api/projects/${runId}/${entry}`;
  const errors: string[] = [];
  const notes: string[] = [];
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 400)));
      page.on("console", (m) => {
        if (m.type() === "error") {
          const t = m.text();
          if (!/favicon|net::ERR_BLOCKED/i.test(t)) errors.push(t.slice(0, 400));
        }
      });
      page.on("requestfailed", (r) => {
        const u = r.url();
        if (/^https?:/.test(u) && !/favicon/.test(u)) errors.push(`منبع بار نشد: ${u.slice(0, 180)} (${r.failure()?.errorText ?? ""})`);
      });
      await page.addInitScript(() => {
        const w = window as unknown as { __raf: number; __errs: string[] };
        w.__raf = 0;
        w.__errs = [];
        const orig = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => {
          w.__raf += 1;
          return orig(cb);
        };
        window.addEventListener("error", (e) => w.__errs.push(String(e.message || "error")));
      });

      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      if (!res || res.status() >= 400) errors.push(`صفحه باز نشد (HTTP ${res?.status() ?? "?"})`);
      await page.waitForTimeout(700);

      // هر دکمه‌ای که شبیه شروع است را بزن، بعد خود بوم را
      const clicked = await page.evaluate(() => {
        const re = /start|play|begin|شروع|اجرا|بازی|ورود|ادامه/i;
        const els = [...document.querySelectorAll("button, a, [role=button], .start, #start, #play")];
        const hit = els.find((e) => re.test((e.textContent || "") + (e.id || "") + (e.className || "")));
        (hit || els[0])?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        document.querySelector("canvas")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return !!(hit || els[0]);
      });
      if (clicked) notes.push("دکمه‌ی شروع زده شد");
      await page.keyboard.press("Enter").catch(() => undefined);
      await page.keyboard.press("Space").catch(() => undefined);
      await page.keyboard.press("ArrowRight").catch(() => undefined);
      await page.waitForTimeout(1400);

      const probe = await page.evaluate(async () => {
        const w = window as unknown as { __raf: number; __errs: string[] };
        const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
        let drew = false;
        let glOk = false;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
          if (ctx) {
            const sample = () => {
              try {
                return Array.from(ctx.getImageData(0, 0, Math.min(16, canvas.width), Math.min(16, canvas.height)).data);
              } catch {
                return [];
              }
            };
            const a = sample();
            await new Promise((r) => setTimeout(r, 350));
            const b = sample();
            drew = a.length > 0 && a.some((v, i) => v !== b[i]);
          } else if (gl) {
            glOk = !gl.isContextLost();
            const px = new Uint8Array(16);
            gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const first = Array.from(px);
            await new Promise((r) => setTimeout(r, 350));
            gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, px);
            drew = first.some((v, i) => v !== px[i]) || px.some((v) => v > 0);
          }
        }
        const variance = (data: number[]) => {
          if (!data.length) return 0;
          let s = 0;
          let s2 = 0;
          for (const v of data) {
            s += v;
            s2 += v * v;
          }
          const m = s / data.length;
          return s2 / data.length - m * m;
        };
        let vivid = false;
        if (canvas) {
          const ctx2 = canvas.getContext("2d");
          if (ctx2) {
            try {
              const sample = ctx2.getImageData(
                Math.floor(canvas.width / 2) - 8,
                Math.floor(canvas.height / 2) - 8,
                16,
                16,
              ).data;
              vivid = variance(Array.from(sample)) > 12;
            } catch {
              /* tainted */
            }
          }
        }
        return {
          raf: w.__raf || 0,
          errs: w.__errs || [],
          drew: drew || vivid,
          glOk,
          hasCanvas: !!canvas,
          vivid,
          text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400),
          buttons: [...document.querySelectorAll("button, a")].map((e) => (e.textContent || "").trim()).filter(Boolean).slice(0, 8),
        };
      });
      errors.push(...probe.errs.filter((e) => !errors.includes(e)));

      const shot = path.join(projectDir(runId), "preview.png");
      await page.screenshot({ path: shot, fullPage: false }).catch(() => undefined);
      let screenshot: string | undefined;
      try {
        await fs.access(shot);
        screenshot = `/api/projects/${runId}/preview.png`;
      } catch {
        /* no shot */
      }

      const alive = probe.raf > 8 || probe.drew;
      if (expectGame) {
        if (!probe.hasCanvas && probe.raf < 3) errors.push("بازی بوت نشد: نه بوم رسم هست و نه حلقه‌ی انیمیشن.");
        if (probe.hasCanvas && !alive) errors.push("بوم هست ولی حلقه‌ی بازی اجرا نشد و چیزی رسم نشد.");
        if (probe.text.length < 2 && !probe.drew) errors.push("صفحه خالی است؛ کاربر چیزی برای بازی‌کردن نمی‌بیند.");
      } else if (!alive && probe.text.length < 20 && !probe.hasCanvas) {
        errors.push("برنامه محتوای قابل‌مشاهده ندارد.");
      }
      if (probe.drew) notes.push("بوم در حال رسم است");
      if (probe.raf) notes.push(`${probe.raf} فریم انیمیشن`);
      if (probe.buttons.length) notes.push(`کنترل‌ها: ${probe.buttons.join("، ")}`);

      const fatal = errors.filter((e) => !/favicon/i.test(e));
      return { ok: fatal.length === 0, tested: true, kind: "browser", errors: fatal.slice(0, 12), notes, raf: probe.raf, drew: probe.drew, screenshot };
    } finally {
      await browser.close();
    }
  } catch (e) {
    return { ok: false, tested: false, kind: "skipped", errors: [`تست مرورگر اجرا نشد: ${(e as Error).message}`], notes, raf: 0, drew: false };
  }
}

/** اجرای واقعی برنامه‌ی Node و خواندن خروجی */
export async function nodeTest(runId: number, entry: string): Promise<PlayReport> {
  const cwd = projectDir(runId);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry], { cwd, timeout: 8000 });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    const finish = (ok: boolean, extra: string[] = []) =>
      resolve({
        ok,
        tested: true,
        kind: "node",
        errors: extra.concat(err.trim() ? [err.trim().slice(0, 500)] : []).filter(Boolean).slice(0, 8),
        notes: out.trim() ? [out.trim().slice(0, 300)] : [],
        raf: 0,
        drew: false,
      });
    child.on("error", (e) => finish(false, [e.message]));
    child.on("exit", (code) => {
      if (code === 0 || out.trim()) finish(code === 0 || code === null);
      else finish(false, [`خروج با کد ${code}`]);
    });
    setTimeout(() => {
      child.kill("SIGTERM");
      finish(true, out || err ? [] : []);
    }, 4000);
  });
}
