"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Btn({
  children,
  onClick,
  variant = "ghost",
  size = "md",
  disabled,
  title,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "neuro" | "solid";
  size?: "sm" | "md" | "xs";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none";
  const sizes = {
    xs: "text-[11px] px-2 py-1",
    sm: "text-xs px-2.5 py-1.5",
    md: "text-[13px] px-3.5 py-2",
  }[size];
  const variants = {
    primary:
      "border-plasma-500/50 bg-plasma-500/12 text-plasma-300 hover:bg-plasma-500/22 hover:border-plasma-400/80 hover:shadow-[0_0_22px_-6px_rgba(56,220,245,0.7)]",
    neuro:
      "border-neuro-500/50 bg-neuro-500/12 text-neuro-300 hover:bg-neuro-500/22 hover:border-neuro-400/80",
    ghost: "border-line bg-void-850/70 text-slate-300 hover:border-plasma-500/40 hover:text-plasma-300",
    solid: "border-transparent bg-slate-100 text-void-950 hover:bg-white font-semibold",
    danger: "border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
  }[variant];
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`${base} ${sizes} ${variants} ${className}`}>
      {children}
    </button>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  width = "max-w-4xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-void-950/78 backdrop-blur-[3px]" onClick={onClose} />
      <aside
        className={`relative ms-auto h-full w-full ${width} border-s border-line bg-void-900/97 shadow-[0_0_90px_-10px_rgba(18,184,214,0.35)] flex flex-col`}
        style={{ animation: "slideIn .22s cubic-bezier(.2,.9,.2,1)" }}
      >
        <style>{`@keyframes slideIn{from{transform:translateX(-24px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="text-plasma-400">{icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-slate-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11.5px] text-slate-500 truncate">{subtitle}</p>}
          </div>
          <Btn size="sm" onClick={onClose} title="بستن">
            <X size={15} />
          </Btn>
        </header>
        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="panel-title block mb-1.5">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-md border border-line bg-void-950/80 px-3 py-2 text-[13px] text-slate-200 outline-none transition focus:border-plasma-500/70 focus:shadow-[0_0_0_3px_rgba(56,220,245,0.09)] placeholder:text-slate-600";

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2 text-[11.5px] text-slate-400 hover:text-slate-200"
      title={label}
    >
      <span
        className={`relative h-4 w-8 rounded-full border transition-all ${
          on ? "border-plasma-400/80 bg-plasma-500/35" : "border-line bg-void-800"
        }`}
      >
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all ${
            on ? "start-[18px] bg-plasma-300 shadow-[0_0_10px_rgba(56,220,245,0.9)]" : "start-[3px] bg-slate-600"
          }`}
        />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

export function Check({ on, onChange, label, color = "plasma" }: { on: boolean; onChange: (v: boolean) => void; label?: string; color?: "plasma" | "neuro" | "ok" | "warn" }) {
  const c = {
    plasma: "border-plasma-400 bg-plasma-500/25 text-plasma-300",
    neuro: "border-neuro-400 bg-neuro-500/25 text-neuro-300",
    ok: "border-ok bg-ok/25 text-ok",
    warn: "border-warn bg-warn/25 text-warn",
  }[color];
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`grid h-4 w-4 place-items-center rounded-[4px] border text-[10px] leading-none transition ${
        on ? c : "border-line bg-void-950 text-transparent hover:border-slate-600"
      }`}
      title={label}
    >
      ✓
    </button>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "plasma" | "neuro" | "ok" | "warn" | "bad" }) {
  const t = {
    slate: "border-line bg-void-850 text-slate-400",
    plasma: "border-plasma-500/40 bg-plasma-500/12 text-plasma-300",
    neuro: "border-neuro-500/40 bg-neuro-500/12 text-neuro-300",
    ok: "border-ok/40 bg-ok/10 text-ok",
    warn: "border-warn/40 bg-warn/10 text-warn",
    bad: "border-bad/40 bg-bad/10 text-bad",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px] ${t}`}>{children}</span>;
}

export function Bar({ value, tone = "plasma", height = 4 }: { value: number; tone?: "plasma" | "neuro" | "ok" | "warn"; height?: number }) {
  const bg = { plasma: "bg-plasma-400", neuro: "bg-neuro-400", ok: "bg-ok", warn: "bg-warn" }[tone];
  return (
    <div className="w-full overflow-hidden rounded-full bg-void-800" style={{ height }}>
      <div className={`h-full ${bg} transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Stat({ label, value, tone = "plasma", sub }: { label: string; value: ReactNode; tone?: "plasma" | "neuro" | "ok" | "warn"; sub?: string }) {
  const ring = {
    plasma: "border-plasma-500/30 text-plasma-300",
    neuro: "border-neuro-500/30 text-neuro-300",
    ok: "border-ok/30 text-ok",
    warn: "border-warn/30 text-warn",
  }[tone];
  return (
    <div className={`hud rounded-lg px-3 py-2.5 ${ring.split(" ")[0]}`}>
      <div className="panel-title">{label}</div>
      <div className={`mt-1 font-mono text-[19px] font-bold leading-none ${ring.split(" ")[1]}`}>{value}</div>
      {sub && <div className="mt-1 text-[10.5px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between gap-3 first:mt-0">
      <h4 className="flex items-center gap-2 text-[12.5px] font-bold tracking-wide text-slate-200">
        <span className="h-3 w-[2px] rounded bg-plasma-400 shadow-[0_0_8px_rgba(56,220,245,0.8)]" />
        {children}
      </h4>
      {right}
    </div>
  );
}
