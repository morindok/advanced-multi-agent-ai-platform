"use client";

import { useCallback, useEffect, useState } from "react";
import { Code2, Copy, Download, FileText, FileJson, Film, Globe, Image as ImageIcon, Layers, Terminal } from "lucide-react";
import { api, fmtNum } from "@/lib/api";
import type { ArtifactMeta } from "@/lib/ui-types";
import Markdown from "./Markdown";
import { Badge, Btn, Drawer } from "./ui";

type Full = ArtifactMeta & { content: string; children?: { id: number; title: string; bytes: number }[]; chars?: number };

const KIND_ICON: Record<string, React.ReactNode> = {
  markdown: <FileText size={13} />,
  code: <Code2 size={13} />,
  html: <Globe size={13} />,
  json: <FileJson size={13} />,
  image: <ImageIcon size={13} />,
  video: <Film size={13} />,
  blueprint: <Layers size={13} />,
  project: <Globe size={13} />,
  chart: <Layers size={13} />,
};

export default function ArtifactViewer({
  open,
  onClose,
  artifacts,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  artifacts: ArtifactMeta[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [full, setFull] = useState<Full | null>(null);
  const [merged, setMerged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const id = selectedId ?? artifacts[0]?.id ?? null;

  const load = useCallback(async () => {
    if (!id) return setFull(null);
    setLoading(true);
    try {
      const q = merged ? "?merged=1" : "";
      const f = await api.get<Full>(`/api/artifacts/${id}${q}`);
      setFull(f);
    } catch {
      setFull(null);
    } finally {
      setLoading(false);
    }
  }, [id, merged]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const roots = artifacts.filter((a) => !a.parentId);
  const totalBytes = artifacts.reduce((s, a) => s + (a.bytes || 0), 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="آثار و پیش‌نمایش خروجی‌ها"
      subtitle={`${fmtNum(artifacts.length)} اثر · ${fmtNum(totalBytes)} کاراکتر تولیدشده توسط مغز`}
      icon={<Layers size={16} />}
      width="max-w-6xl"
    >
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* فهرست آثار */}
        <aside className="max-h-[70vh] overflow-y-auto scroll-thin rounded-lg border border-line bg-void-850/40 p-2 lg:sticky lg:top-0">
          <div className="panel-title px-1.5 pb-1.5">فهرست</div>
          <ul className="space-y-1">
            {roots.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    onSelect(a.id);
                    setMerged(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-start transition ${
                    id === a.id ? "border border-plasma-500/50 bg-plasma-500/12 text-plasma-200" : "border border-transparent text-slate-400 hover:bg-void-800 hover:text-slate-200"
                  }`}
                >
                  <span className="shrink-0 text-plasma-400">{KIND_ICON[a.kind] ?? <FileText size={13} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px]">{a.title}</span>
                    <span className="block font-mono text-[9.5px] text-slate-600">#{a.id} · {a.kind} · {fmtNum(a.bytes)}ch</span>
                  </span>
                </button>
                {artifacts.filter((x) => x.parentId === a.id).length > 0 && (
                  <div className="ms-4 mt-0.5 border-s border-line-soft ps-2 text-[10px] text-slate-600">
                    {fmtNum(artifacts.filter((x) => x.parentId === a.id).length)} بخش فرزند
                  </div>
                )}
              </li>
            ))}
            {!roots.length && <li className="px-2 py-6 text-center text-[11.5px] text-slate-600">هنوز اثری ثبت نشده است.</li>}
          </ul>
        </aside>

        {/* پیش‌نمایش */}
        <section className="min-w-0">
          {!full ? (
            <div className="grid h-64 place-items-center rounded-lg border border-dashed border-line text-[12px] text-slate-600">
              {loading ? "در حال بارگذاری اثر…" : "اثری انتخاب نشده است"}
            </div>
          ) : (
            <>
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <h4 className="text-[13.5px] font-bold text-slate-100">{full.title}</h4>
                <Badge tone="plasma">#{full.id}</Badge>
                <Badge>{full.kind}</Badge>
                {full.lang && <Badge tone="neuro">{full.lang}</Badge>}
                <Badge tone="ok">{fmtNum(full.chars ?? full.content.length)} کاراکتر</Badge>
                <div className="ms-auto flex gap-1.5">
                  {full.kind === "blueprint" && (
                    <Btn size="xs" variant={merged ? "neuro" : "ghost"} onClick={() => setMerged((m) => !m)}>
                      {merged ? "نمای فهرست" : "نمای سند یکپارچه"}
                    </Btn>
                  )}
                  <Btn
                    size="xs"
                    onClick={async () => {
                      await navigator.clipboard.writeText(full.content);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    <Copy size={12} /> {copied ? "کپی شد" : "کپی"}
                  </Btn>
                  <a href={`/api/artifacts/${full.id}?download=1${merged ? "&merged=1" : ""}`}>
                    <Btn size="xs">
                      <Download size={12} /> دانلود
                    </Btn>
                  </a>
                </div>
              </header>

              <Preview full={full} />

              {full.children && full.children.length > 0 && !merged && (
                <div className="mt-4 rounded-lg border border-line bg-void-850/40 p-3">
                  <div className="panel-title mb-2 flex items-center gap-1.5">
                    <Terminal size={11} /> بخش‌های این سند ({fmtNum(full.children.length)})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {full.children.slice(0, 120).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          onSelect(c.id);
                          setMerged(false);
                        }}
                        className="rounded border border-line bg-void-900 px-2 py-1 text-[10.5px] text-slate-400 transition hover:border-plasma-500/50 hover:text-plasma-300"
                      >
                        {c.title.slice(0, 46)} <span className="font-mono text-slate-600">{fmtNum(c.bytes)}ch</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function Preview({ full }: { full: Full }) {
  if (full.kind === "project") return <ProjectPreview full={full} />;
  if (full.kind === "image") {
    const src = full.url ?? (full.meta?.b64 ? `data:image/png;base64,${String(full.meta.b64)}` : "");
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={full.title} className="max-h-[60vh] w-auto rounded-lg border border-line" />
    ) : (
      <Empty text="تصویر بدون آدرس" />
    );
  }
  if (full.kind === "video") {
    return full.url ? (
      <video src={full.url} controls className="max-h-[60vh] w-full rounded-lg border border-line bg-black" />
    ) : (
      <Empty text="ویدیو بدون آدرس" />
    );
  }
  if (full.kind === "html") {
    return (
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex items-center gap-1.5 border-b border-line bg-void-850 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-bad/70" />
          <span className="h-2 w-2 rounded-full bg-warn/70" />
          <span className="h-2 w-2 rounded-full bg-ok/70" />
          <span className="ms-2 font-mono text-[10px] text-slate-500">پیش‌نمایش زنده HTML (ایزوله)</span>
        </div>
        <iframe title={full.title} sandbox="allow-scripts" srcDoc={full.content} className="h-[58vh] w-full bg-white" />
      </div>
    );
  }
  if (full.kind === "code" || full.kind === "json") {
    const lines = full.content.split("\n");
    return (
      <div className="max-h-[64vh] overflow-auto scroll-thin rounded-lg border border-line bg-[#05080f]">
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-void-850/95 px-3 py-1.5 font-mono text-[10px] text-slate-500 backdrop-blur">
          <Code2 size={11} className="text-plasma-400" />
          <span dir="ltr">{full.title}</span>
          <span className="ms-auto">{fmtNum(lines.length)} خط</span>
        </div>
        <pre dir="ltr" className="p-3 text-start font-mono text-[11.5px] leading-[1.75] text-[#c8f6ff]">
          <code>{full.content}</code>
        </pre>
      </div>
    );
  }
  // markdown / blueprint / هر متن دیگر
  return (
    <div className="max-h-[64vh] overflow-y-auto scroll-thin rounded-lg border border-line bg-void-850/40 px-4 py-3">
      <Markdown text={full.content} />
    </div>
  );
}

function ProjectPreview({ full }: { full: Full }) {
  const m = full.meta as {
    previewUrl?: string;
    zipUrl?: string;
    kind?: string;
    entry?: string;
    files?: string[];
    verified?: boolean;
    issues?: { file: string; msg: string }[];
  };
  const files = m.files ?? [];
  const runned = m.kind !== "node" && !!m.previewUrl;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={m.verified ? "ok" : "warn"}>{m.verified ? "اعتبارسنجی شد ✓" : "نیاز به بررسی"}</Badge>
        <Badge tone="plasma">{m.kind === "node" ? "برنامه‌ی Node" : "وب — بدون نصب"}</Badge>
        <Badge>{fmtNum(files.length)} فایل</Badge>
        {runned && (
          <a href={m.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-plasma-400/70 bg-plasma-500/20 px-2.5 py-1 text-[11px] font-bold text-plasma-200">
            ▶ اجرا در تب جدید
          </a>
        )}
        {m.zipUrl && (
          <a href={m.zipUrl}>
            <Btn size="xs">
              <Download size={12} /> دانلود ZIP (کامل و قابل اجرا)
            </Btn>
          </a>
        )}
      </div>
      {runned && (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <iframe title={full.title} src={m.previewUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-modals allow-popups" className="h-[58vh] w-full bg-black" />
        </div>
      )}
      {m.kind === "node" && (
        <p className="text-[12px] text-slate-400">
          بعد از دانلود ZIP، در پوشه‌ی پروژه اجرا کنید: <code className="font-mono">node {m.entry}</code>
        </p>
      )}
      {!!m.issues?.length && (
        <ul className="space-y-1 rounded border border-warn/40 bg-warn/[0.06] p-2.5 text-[11.5px] text-warn">
          {m.issues.map((i, k) => (
            <li key={k} dir="ltr">⚠ {i.file}: {i.msg}</li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border border-line bg-void-850/40 p-2.5">
        <div className="panel-title mb-1.5">فایل‌ها</div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {files.map((f) => (
            <li key={f}>
              <a dir="ltr" className="font-mono text-[11px] text-plasma-300 hover:underline" href={`/api/projects/${full.runId}/${f}`} target="_blank" rel="noreferrer">
                {f}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid h-40 place-items-center rounded-lg border border-dashed border-line text-[12px] text-slate-600">{text}</div>;
}
