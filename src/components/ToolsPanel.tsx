"use client";

import { useEffect, useState } from "react";
import { Blocks, Play, Plus, Wrench } from "lucide-react";
import { api, fmtNum } from "@/lib/api";
import type { ToolInfo } from "@/lib/ui-types";
import { Badge, Btn, Field, SectionTitle, Toggle, inputCls } from "./ui";

const RISK_TONE: Record<string, "ok" | "warn" | "bad"> = { low: "ok", medium: "warn", high: "bad" };

export default function ToolsPanel({ onChanged }: { onChanged: () => void }) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [argsText, setArgsText] = useState("{}");
  const [result, setResult] = useState<{ ok: boolean; text: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ key: "", name: "", description: "", source: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await api.get<{ tools: ToolInfo[] }>("/api/tools");
    setTools(r.tools);
  }
  useEffect(() => {
    void load();
  }, []);

  async function run(t: ToolInfo) {
    setBusy(true);
    setResult(null);
    try {
      const args = JSON.parse(argsText || "{}") as Record<string, unknown>;
      const r = await api.post<{ ok: boolean; text: string; error?: string }>("/api/tools", { action: "exec", key: t.key, args });
      setResult(r);
      await load();
      onChanged();
    } catch (e) {
      setResult({ ok: false, text: "", error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function synthesize() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ ok: boolean; text: string; error?: string }>("/api/tools", { action: "synthesize", ...form });
      setMsg({ ok: r.ok, text: r.ok ? r.text : (r.error ?? "خطا") });
      if (r.ok) {
        setForm({ key: "", name: "", description: "", source: "" });
        await load();
        onChanged();
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 pb-8">
      <p className="rounded-md border border-line bg-void-850/50 px-3 py-2 text-[11.5px] leading-6 text-slate-400">
        جعبه‌ابزار زنده‌ی جن. اگر ابزار لازم وجود نداشته باشد، جن با <span className="font-mono text-plasma-300">tool.synthesize</span> ابزار تازه را
        می‌نویسد، اعتبارسنجی می‌کند و بلافاصله در رجیستری به کار می‌گیرد — این یعنی خودبرنامه‌نویسی. تو هم می‌توانی دستی ابزار بسازی.
      </p>

      {tools.map((t) => (
        <div key={t.id} className={`hud rounded-lg ${openKey === t.key ? "border-plasma-500/50" : ""}`}>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className="text-plasma-400">{t.builtin ? <Wrench size={14} /> : <Blocks size={14} />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-bold text-slate-100">{t.name}</span>
                <span dir="ltr" className="font-mono text-[10.5px] text-plasma-300">{t.key}</span>
                <Badge tone={RISK_TONE[t.risk] ?? "ok"}>ریسک: {t.risk}</Badge>
                {!t.builtin && <Badge tone="neuro">سنتزشده</Badge>}
                <span className="font-mono text-[10px] text-slate-600">{fmtNum(t.uses)} اجرا · {fmtNum(t.failures)} خطا</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{t.description}</p>
            </div>
            <Toggle on={t.enabled} onChange={async () => { await api.post("/api/tools", { action: "toggle", id: t.id }); await load(); }} label="فعال" />
            <Btn size="xs" onClick={() => { setOpenKey(openKey === t.key ? null : t.key); setResult(null); setArgsText(defaultArgs(t)); }}>
              {openKey === t.key ? "بستن" : "اجرای دستی"}
            </Btn>
            {!t.builtin && (
              <Btn size="xs" variant="danger" onClick={async () => { await api.post("/api/tools", { action: "delete", id: t.id }); await load(); }}>
                حذف
              </Btn>
            )}
          </div>

          {openKey === t.key && (
            <div className="border-t border-line px-3 py-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(t.params ?? []).map((p) => (
                  <Badge key={p.name}>
                    {p.name}: {p.type ?? "any"}{p.required ? " *" : ""}
                  </Badge>
                ))}
              </div>
              <Field label="آرگومان‌ها (JSON)">
                <textarea dir="ltr" rows={4} className={`${inputCls} font-mono text-[11.5px]`} value={argsText} onChange={(e) => setArgsText(e.target.value)} />
              </Field>
              <div className="mt-2 flex gap-2">
                <Btn variant="primary" size="sm" onClick={() => void run(t)} disabled={busy}>
                  <Play size={13} /> اجرا
                </Btn>
              </div>
              {result && (
                <pre
                  className={`mt-2 max-h-72 overflow-auto scroll-thin whitespace-pre-wrap rounded-md border px-3 py-2 font-mono text-[11px] leading-6 ${
                    result.ok ? "border-ok/40 bg-ok/[0.06] text-ok" : "border-bad/40 bg-bad/[0.06] text-bad"
                  }`}
                >
                  {result.ok ? result.text : result.error}
                </pre>
              )}
              {t.source && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-plasma-300">کد منبع ابزار</summary>
                  <pre dir="ltr" className="mt-1.5 overflow-auto scroll-thin rounded-md border border-line bg-void-950 p-2.5 text-start font-mono text-[11px] text-slate-300">
                    {t.source}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      ))}

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <Plus size={13} /> سنتز ابزار تازه (خودبرنامه‌نویسی)
        </span>
      </SectionTitle>
      <div className="hud space-y-3 rounded-lg p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="کلید (لاتین، نقطه‌دار)">
            <input dir="ltr" className={`${inputCls} font-mono text-[12px]`} placeholder="math.fibonacci" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          </Field>
          <Field label="نام">
            <input className={inputCls} placeholder="محاسبه‌ی فیبوناچی" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="توضیح">
            <input className={inputCls} placeholder="چه کاری انجام می‌دهد" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <Field
          label="کد بدنه (JavaScript — ناهمگام)"
          hint="دسترسی‌ها: args (آرگومان‌ها)، H.json/H.http (شبکه)، H.sma/H.ema/H.rsi/H.macd (اندیکاتورها)، H.read/H.write (فضای کاری)، H.log. باید return کنی: رشته یا {ok,text,data}."
        >
          <textarea
            dir="ltr"
            rows={7}
            className={`${inputCls} font-mono text-[11.5px] leading-6`}
            placeholder={`const n = Number(args.n ?? 10);\nlet a = 0, b = 1, out = [];\nfor (let i = 0; i < n; i++) { out.push(a); [a, b] = [b, a + b]; }\nreturn { ok: true, text: out.join(", "), data: out };`}
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </Field>
        <Btn variant="neuro" onClick={() => void synthesize()} disabled={busy || !form.key || !form.source}>
          <Blocks size={14} /> ساخت، اعتبارسنجی و ثبت در رجیستری
        </Btn>
        {msg && <div className={`rounded border px-3 py-2 text-[11.5px] ${msg.ok ? "border-ok/40 bg-ok/8 text-ok" : "border-bad/40 bg-bad/8 text-bad"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

function defaultArgs(t: ToolInfo) {
  switch (t.key) {
    case "web.search": return JSON.stringify({ query: "NCP neural consensus protocol" }, null, 2);
    case "web.fetch": return JSON.stringify({ url: "https://example.com", limit: 6000 }, null, 2);
    case "market.scan": return JSON.stringify({ tickers: ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"], market: "crypto" }, null, 2);
    case "market.search": return JSON.stringify({ query: "BTC" }, null, 2);
    case "market.history": return JSON.stringify({ symbol: "BTC-USD", range: "6mo", interval: "1d" }, null, 2);
    case "code.exec": return JSON.stringify({ code: "return 2+2;" }, null, 2);
    case "fs.workspace": return JSON.stringify({ op: "list", path: "." }, null, 2);
    case "shell.exec": return JSON.stringify({ command: "ls -la" }, null, 2);
    default:
      return JSON.stringify(Object.fromEntries((t.params ?? []).map((p) => [p.name, p.type === "number" ? 0 : ""])), null, 2);
  }
}
