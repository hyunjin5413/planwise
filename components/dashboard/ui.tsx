import type { ReactNode } from "react";
import type { FindingType } from "@/lib/domain/types";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-gray-800 bg-white/[0.02] ${className}`}>{children}</div>;
}

export type Tone = "red" | "orange" | "amber" | "green" | "gray" | "blue" | "white";

const TONES: Record<Tone, string> = {
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  orange: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  green: "bg-green-500/15 text-green-300 border-green-500/30",
  gray: "bg-gray-500/10 text-gray-400 border-gray-600/40",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  white: "bg-white text-black border-white",
};

export function Chip({ tone = "gray", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export const FINDING_TONE: Record<FindingType, Tone> = {
  violation: "red",
  missing: "orange",
  check: "amber",
  pending: "gray",
};

export const FINDING_DOT: Record<FindingType, string> = {
  violation: "#ef4444",
  missing: "#f97316",
  check: "#f59e0b",
  pending: "#6b7280",
};

export const inputCls =
  "h-10 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm [color-scheme:dark] text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none disabled:opacity-50";

export const ghostBtn =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-gray-700 px-3 text-sm text-gray-200 transition-colors hover:bg-gray-800/60 disabled:pointer-events-none disabled:opacity-40";

export const primaryBtn =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-medium text-gray-300">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-gray-500">{hint}</span>}
    </label>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ColorChip({ color, abbr }: { color: string; abbr: string }) {
  return (
    <span
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[10px] font-bold text-white"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {abbr}
    </span>
  );
}

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-gray-500 ${className}`}>
      검토 보조 결과이며 최종 판단은 소방기술사 등 자격자와 관할 소방서에 있습니다.
    </p>
  );
}

export function CheckMark({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6.5 4.8 9 10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
