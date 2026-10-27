"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Loader2, Square, X, Zap } from "lucide-react";
import { classifyIntent } from "@/lib/meta/protocol";
import { Badge, Btn } from "./ui";

export type Attachment = { name: string; type: string; data: string };

const LEVELS = [
  { k: "auto", fa: "خودکار", hint: "مغز خودش سطح عملیات را تعیین می‌کند" },
  { k: "standard", fa: "سریع", hint: "پاسخ مستقیم با شورای کوچک" },
  { k: "deep", fa: "عمیق", hint: "شورای بزرگ‌تر + اجماع + دروازه‌ی کیفیت" },
  { k: "forge", fa: "فرا-حالت", hint: "معماری ≥ هدف ژنوم (پیش‌فرض ۱٬۰۰۰٬۰۰۰ کاراکتر) سپس ساخت واقعی" },
] as const;

const SAMPLES = [
  "یک سیستم عامل جدید با هسته‌ی میکروکرِنل از صفر تا صد طراحی و پیاده‌سازی کن",
  "برو بازار رو تحلیل کن: BTC و ETH رو در تریدینگ‌ویو بررسی کن و سناریوی معامله بده",
  "یک پلتفرم چت بلادرنگ با معماری رویدادمحور بساز",
  "یک پوستر سینمایی از شهری شناور در ابرها بساز",
  "خودت را ارتقا بده: ابزار تازه‌ای برای تحلیل احساسات بازار سنتز کن",
];

export default function Composer({
  onSend,
  running,
  onStop,
  dry,
}: {
  onSend: (prompt: string, attachments: Attachment[], forceMode: string | undefined) => void;
  running: boolean;
  onStop: () => void;
  dry: boolean;
}) {
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [level, setLevel] = useState<string>("auto");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(280, el.scrollHeight)}px`;
  }, [text]);

  const intent = text.trim().length > 3 ? classifyIntent(text, atts.length > 0) : null;

  async function addFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      const data = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.readAsDataURL(f);
      });
      setAtts((a) => [...a, { name: f.name, type: f.type, data }]);
    }
  }

  function submit() {
    const t = text.trim();
    if (!t || running) return;
    onSend(t, atts, level === "auto" ? undefined : level);
    setText("");
    setAtts([]);
  }

  return (
    <div className="px-3 pb-3 sm:px-5 sm:pb-4">
      <div className="hud relative overflow-hidden rounded-xl">
        {running && <span className="absolute inset-x-0 top-0 h-px bg-plasma-400/70" style={{ animation: "scan 2.2s linear infinite" }} />}

        {/* نمونه درخواست‌ها */}
        {!text && !running && (
          <div className="flex flex-wrap gap-1.5 border-b border-line-soft px-3 py-2">
            {SAMPLES.map((s) => (
              <button
                key={s}
                onClick={() => setText(s)}
                className="rounded-full border border-line bg-void-850/70 px-2.5 py-1 text-[10.5px] text-slate-400 transition hover:border-plasma-500/50 hover:text-plasma-300"
              >
                {s.length > 52 ? s.slice(0, 52) + "…" : s}
              </button>
            ))}
          </div>
        )}

        {atts.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-line-soft px-3 py-2">
            {atts.map((a, i) => (
              <span key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:${a.type};base64,${a.data}`} alt={a.name} className="h-14 w-14 rounded-md border border-line object-cover" />
                <button
                  onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}
                  className="absolute -end-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-line bg-void-950 text-bad hover:bg-bad/20"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={(e) => void addFiles(e.clipboardData.files)}
          placeholder="هر چیزی بخواهی… مغز هزار ایجنتی انجامش می‌دهد. (Enter برای ارسال، Shift+Enter برای خط جدید)"
          className="block max-h-[280px] w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-7 text-slate-100 outline-none placeholder:text-slate-600"
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-3 py-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addFiles(e.target.files)} />
          <Btn size="xs" onClick={() => fileRef.current?.click()} title="پیوست تصویر برای ویژن">
            <ImagePlus size={13} /> تصویر
          </Btn>

          <div className="flex items-center gap-1 rounded-md border border-line bg-void-950/60 p-0.5">
            {LEVELS.map((l) => (
              <button
                key={l.k}
                title={l.hint}
                onClick={() => setLevel(l.k)}
                className={`rounded px-2 py-1 text-[10.5px] transition ${
                  level === l.k ? "bg-plasma-500/18 text-plasma-300 shadow-[0_0_14px_-6px_rgba(56,220,245,0.9)]" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {l.k === "forge" && <Zap size={10} className="me-0.5 inline" />}
                {l.fa}
              </button>
            ))}
          </div>

          {intent && (
            <div className="flex items-center gap-1.5">
              <Badge tone="plasma">نیت: {intent.kind}</Badge>
              <Badge tone="neuro">پیچیدگی {(intent.complexity * 100).toFixed(0)}٪</Badge>
              <Badge tone={intent.metaMode === "forge" ? "warn" : "slate"}>سطح: {level === "auto" ? intent.metaMode : level}</Badge>
            </div>
          )}

          {dry && <Badge tone="warn">مغز خاموش — حالت خشک</Badge>}

          <div className="ms-auto flex items-center gap-2">
            {running ? (
              <Btn variant="danger" size="sm" onClick={onStop}>
                <Square size={13} /> توقف
              </Btn>
            ) : (
              <Btn variant="primary" size="sm" onClick={submit} disabled={!text.trim()}>
                {text.trim() ? <ArrowUp size={14} /> : <Loader2 size={14} />} ارسال به مغز
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
