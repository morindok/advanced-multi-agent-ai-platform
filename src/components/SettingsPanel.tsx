"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Radar, RefreshCw, Server, SlidersHorizontal, Trash2, Wand2 } from "lucide-react";
import { api, fmtNum } from "@/lib/api";
import type { ModelInfo, SettingsInfo } from "@/lib/ui-types";
import { Badge, Bar, Btn, Check, Field, SectionTitle, Toggle, inputCls } from "./ui";

export default function SettingsPanel({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [endpointsText, setEndpointsText] = useState("");
  const [keysText, setKeysText] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [capFilter, setCapFilter] = useState<"all" | "text" | "vision" | "image" | "video">("all");
  const [genes, setGenes] = useState<Record<string, unknown>>({});

  async function load() {
    const [i, m] = await Promise.all([api.get<SettingsInfo>("/api/settings"), api.get<{ models: ModelInfo[] }>("/api/models")]);
    setInfo(i);
    setModels(m.models);
    setGenes(i.genome);
    setEndpointsText((prev) => prev || i.endpoints.map((e) => e.url).join("\n"));
  }
  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return models
      .filter((m) => (capFilter === "all" ? true : m[`can${capFilter[0].toUpperCase()}${capFilter.slice(1)}` as keyof ModelInfo]))
      .filter((m) => !s || m.modelId.toLowerCase().includes(s) || m.endpoint.toLowerCase().includes(s) || m.keyLabel.toLowerCase().includes(s))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.score - a.score);
  }, [models, q, capFilter]);

  async function save(replaceKeys = false) {
    setBusy("save");
    setNotice(null);
    try {
      const res = await api.put<SettingsInfo>("/api/settings", {
        endpointsText,
        keysText,
        keepKeyLabels: info?.keys.map((k) => k.label) ?? [],
        replaceKeys,
      });
      setInfo(res);
      setKeysText("");
      setNotice({ ok: true, text: "پیکربندی ذخیره شد." });
      onChanged();
      await load();
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function discover() {
    setBusy("discover");
    setNotice(null);
    try {
      await save();
      const r = await api.post<{ ok: boolean; discovered: number; autoEnabled: number; results: { endpoint: string; keyLabel: string; ok: boolean; count: number; error?: string }[] }>("/api/models");
      const okCount = r.results.filter((x) => x.ok).length;
      setNotice({
        ok: r.ok,
        text: `${fmtNum(r.discovered)} مدل از ${okCount}/${r.results.length} ترکیب کلید×اندپوینت کشف شد${r.autoEnabled ? ` — ${r.autoEnabled} مدل متنی خودکار فعال شد` : ""}.${
          r.results.filter((x) => !x.ok).length ? `\nخطاها:\n` + r.results.filter((x) => !x.ok).map((x) => `• ${x.keyLabel} @ ${x.endpoint}: ${x.error}`).join("\n") : ""
        }`,
      });
      await load();
      onChanged();
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function patch(ids: number[], set: Partial<ModelInfo>) {
    setModels((m) => m.map((x) => (ids.includes(x.id) ? { ...x, ...set } : x)));
    await api.patch("/api/models", { ids, ...set });
    onChanged();
  }

  async function saveGenes() {
    setBusy("genes");
    await api.put("/api/settings", { genome: genes });
    setBusy("");
    setNotice({ ok: true, text: "ژنوم موتور به‌روزرسانی شد." });
    onChanged();
  }

  const enabledCount = models.filter((m) => m.enabled).length;

  return (
    <div className="space-y-4 pb-8">
      {notice && (
        <div className={`whitespace-pre-line rounded-md border px-3 py-2 text-[12px] leading-6 ${notice.ok ? "border-ok/40 bg-ok/8 text-ok" : "border-bad/40 bg-bad/8 text-bad"}`}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: "ایجنت‌ها", v: fmtNum(info?.agents ?? 0), c: "text-plasma-300" },
          { k: "مدل‌های کشف‌شده", v: fmtNum(models.length), c: "text-neuro-300" },
          { k: "مدل‌های فعال", v: fmtNum(enabledCount), c: enabledCount ? "text-ok" : "text-warn" },
          { k: "کلیدها", v: fmtNum(info?.keys.length ?? 0), c: "text-warn" },
        ].map((s) => (
          <div key={s.k} className="hud rounded-lg px-3 py-2.5">
            <div className="panel-title">{s.k}</div>
            <div className={`mt-1 font-mono text-lg font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <SectionTitle right={<Badge tone={info?.dry ? "warn" : "ok"}>{info?.dry ? "مغز خاموش" : "مغز زنده"}</Badge>}>
        <span className="flex items-center gap-1.5">
          <Server size={13} /> آدرس پایه (Endpoints)
        </span>
      </SectionTitle>
      <Field
        label="هر خط یک آدرس پایه — سازگار با OpenAI"
        hint="نمونه: https://api.openai.com/v1 یا https://openrouter.ai/api/v1 یا https://api.groq.com/openai/v1 — کشف مدل‌ها برای همه‌ی ترکیب‌های «اندپوینت × کلید» انجام می‌شود."
      >
        <textarea
          dir="ltr"
          rows={3}
          className={`${inputCls} font-mono text-[12px] leading-6`}
          placeholder={"https://api.openai.com/v1\nhttps://openrouter.ai/api/v1"}
          value={endpointsText}
          onChange={(e) => setEndpointsText(e.target.value)}
        />
      </Field>

      <SectionTitle
        right={
          info?.keys.length ? (
            <Btn size="xs" variant="danger" onClick={() => void save(true)} title="حذف همه کلیدها">
              <Trash2 size={12} /> پاک کردن همه
            </Btn>
          ) : null
        }
      >
        <span className="flex items-center gap-1.5">
          <KeyRound size={13} /> کلیدها (چندخطی)
        </span>
      </SectionTitle>
      <Field
        label="در هر خط یک کلید — اختیاری: برچسب|کلید"
        hint="کلیدها فقط سمت سرور نگهداری می‌شوند و هرگز به مرورگر بازنمی‌گردند (نمایش ماسک‌شده). موتور به‌صورت خودکار بین کلیدها چرخش و در صورت خطا جایگزین می‌کند."
      >
        <textarea
          dir="ltr"
          rows={5}
          className={`${inputCls} font-mono text-[12px] leading-6`}
          placeholder={"openai-main|sk-xxxxxxxx\nopenai-backup|sk-yyyyyyyy\nsk-zzzzzzzzzz"}
          value={keysText}
          onChange={(e) => setKeysText(e.target.value)}
        />
      </Field>
      {info?.keys.length ? (
        <div className="flex flex-wrap gap-1.5">
          {info.keys.map((k) => (
            <span key={k.label} className="inline-flex items-center gap-2 rounded border border-line bg-void-850 px-2 py-1 font-mono text-[11px] text-slate-400">
              <span className="text-plasma-300">{k.label}</span>
              <span dir="ltr">{k.masked}</span>
              <button
                className="text-slate-600 hover:text-bad"
                onClick={async () => {
                  await api.put("/api/settings", { removeKeyLabels: [k.label] });
                  await load();
                }}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Btn variant="primary" onClick={() => void save()} disabled={!!busy}>
          <RefreshCw size={14} className={busy === "save" ? "animate-spin" : ""} /> ذخیره‌ی پیکربندی
        </Btn>
        <Btn variant="neuro" onClick={() => void discover()} disabled={!!busy}>
          <Radar size={14} className={busy === "discover" ? "animate-pulse" : ""} />
          {busy === "discover" ? "در حال کشف مدل‌ها…" : "کشف یک‌جای مدل‌ها برای همه‌ی کلیدها"}
        </Btn>
      </div>

      <SectionTitle
        right={
          <div className="flex items-center gap-2">
            {(["all", "text", "vision", "image", "video"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCapFilter(c)}
                className={`rounded border px-2 py-0.5 font-mono text-[10.5px] transition ${
                  capFilter === c ? "border-plasma-400/70 bg-plasma-500/15 text-plasma-300" : "border-line text-slate-500 hover:text-slate-300"
                }`}
              >
                {c === "all" ? "همه" : c === "text" ? "متن" : c === "vision" ? "ویژن" : c === "image" ? "تصویر" : "ویدیو"}
              </button>
            ))}
          </div>
        }
      >
        ماتریس مدل‌ها و توانمندی‌ها
      </SectionTitle>
      <input className={`${inputCls} mb-2`} placeholder="جست‌وجوی مدل / اندپوینت / برچسب کلید…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mb-2 flex flex-wrap gap-2">
        <Btn size="xs" onClick={() => void patch(shown.map((m) => m.id), { enabled: true })}>فعال‌کردن فهرست جاری</Btn>
        <Btn size="xs" onClick={() => void patch(shown.map((m) => m.id), { enabled: false })}>غیرفعال‌کردن فهرست جاری</Btn>
        <Btn size="xs" onClick={() => void patch(models.filter((m) => m.canText).map((m) => m.id), { enabled: true })}>فعال‌کردن همه‌ی مدل‌های متنی</Btn>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead className="bg-void-850/80 text-slate-400">
            <tr>
              <th className="px-2 py-2 text-start font-medium">فعال</th>
              <th className="px-2 py-2 text-start font-medium">مدل</th>
              <th className="px-2 py-2 text-start font-medium">کلید/اندپوینت</th>
              <th className="px-2 py-1.5 text-center font-medium">متن</th>
              <th className="px-2 py-1.5 text-center font-medium">ویژن</th>
              <th className="px-2 py-1.5 text-center font-medium">تصویر</th>
              <th className="px-2 py-1.5 text-center font-medium">ویدیو</th>
              <th className="px-2 py-2 text-start font-medium">امتیاز مغز</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((m) => (
              <tr key={m.id} className={`border-t border-line-soft transition hover:bg-void-850/60 ${m.enabled ? "bg-plasma-500/[0.035]" : ""}`}>
                <td className="px-2 py-1.5">
                  <Toggle on={m.enabled} onChange={(v) => void patch([m.id], { enabled: v })} />
                </td>
                <td className="px-2 py-1.5">
                  <div dir="ltr" className="text-start font-mono text-[11.5px] text-slate-200">{m.modelId}</div>
                  {!m.hasKey && <Badge tone="bad">کلید موجود نیست</Badge>}
                  {m.lastError && <div className="mt-0.5 max-w-[240px] truncate text-[10px] text-bad/80" title={m.lastError}>{m.lastError}</div>}
                </td>
                <td className="px-2 py-1.5">
                  <div className="text-plasma-300/90">{m.keyLabel}</div>
                  <div dir="ltr" className="max-w-[190px] truncate text-[10px] text-slate-500">{m.endpoint}</div>
                </td>
                {(["canText", "canVision", "canImage", "canVideo"] as const).map((cap, i) => (
                  <td key={cap} className="px-2 py-1.5 text-center">
                    <span className="inline-flex justify-center">
                      <Check
                        on={m[cap]}
                        color={i === 0 ? "plasma" : i === 1 ? "neuro" : i === 2 ? "ok" : "warn"}
                        onChange={(v) => void patch([m.id], { [cap]: v } as Partial<ModelInfo>)}
                      />
                    </span>
                  </td>
                ))}
                <td className="w-[130px] px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Bar value={m.score} tone={m.score > 0.7 ? "ok" : m.score > 0.4 ? "plasma" : "warn"} />
                    <span className="font-mono text-[10.5px] text-slate-500">{m.score.toFixed(2)}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-600">{m.calls} فراخوانی · {m.latencyMs}ms</div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  مدلی یافت نشد — ابتدا آدرس پایه و کلیدها را ذخیره و سپس «کشف مدل‌ها» را بزنید.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} /> ژنوم فراالگوریتم (تنظیم دقیق موتور)
        </span>
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { k: "blueprint.targetChars", label: "حداقل حجم معماری پیش از ساخت (کاراکتر)", hint: "پیش‌فرض ۱٬۰۰۰٬۰۰۰ — موتور تا رسیدن به آن از دروازه نمی‌گذرد." },
          { k: "blueprint.maxCalls", label: "بودجه‌ی فراخوانی در هر اجرا", hint: "پس از اتمام، اجرا «متوقف» می‌شود و با «ادامه‌ی انبساط» از همان نقطه ادامه می‌یابد." },
          { k: "blueprint.sectionChars", label: "حجم هدف هر بخش معماری", hint: "ژنوم می‌تواند آن را بر اساس رأی هیئت افزایش دهد." },
          { k: "blueprint.batch", label: "اندازه‌ی دسته‌ی انبساط موازی", hint: "تعداد بخش‌هایی که هم‌زمان نگارش می‌شوند." },
          { k: "consensus.threshold", label: "آستانه‌ی اجماع (۰ تا ۱)", hint: "تا رسیدن رأی هیئت ۱۰۰ نفره به این عدد، خروجی بازسازی می‌شود." },
          { k: "consensus.maxIterations", label: "حداکثر چرخه‌ی نقد و بازسازی", hint: "" },
          { k: "engine.parallelism", label: "درجه‌ی موازی‌سازی نورون‌ها", hint: "خودتکاملی: بر پایه‌ی تأخیر واقعی مدل‌ها تنظیم می‌شود." },
          { k: "engine.maxToolSteps", label: "حداکثر گام خودکار جعبه‌ابزار", hint: "" },
        ].map((f) => (
          <Field key={f.k} label={f.label} hint={f.hint || undefined}>
            <input
              dir="ltr"
              className={`${inputCls} font-mono text-[12px]`}
              value={String(genes[f.k] ?? "")}
              onChange={(e) => setGenes((g) => ({ ...g, [f.k]: Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) }))}
            />
          </Field>
        ))}
        <div className="rounded-md border border-line bg-void-850/60 px-3 py-2.5 sm:col-span-2">
          <Toggle
            on={genes["security.allowShell"] === true}
            onChange={(v) => setGenes((g) => ({ ...g, "security.allowShell": v }))}
            label="دسترسی پوسته (shell.exec) — پرخطر؛ فقط در محیط ایزوله فعال شود"
          />
        </div>
      </div>
      <Btn variant="neuro" onClick={() => void saveGenes()} disabled={!!busy}>
        <Wand2 size={14} className={busy === "genes" ? "animate-pulse" : ""} /> اعمال ژنوم
      </Btn>
    </div>
  );
}
