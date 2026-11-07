"use client";

import { CATEGORY_LABELS, OBJECT_CATALOG, type ObjectCategory, type ObjectKind } from "@/lib/domain/catalog";
import type { Tally } from "@/lib/engine/review";
import { ColorChip } from "./ui";

const CATS: ObjectCategory[] = ["extinguishing", "alarm", "evacuation"];

export function statusText(t: Tally): { main: string; sub: string; tone: "red" | "gray" | "white" | "amber" } {
  switch (t.status) {
    case "detected":
      return { main: `${t.count}개`, sub: t.lowConfidence ? `확인 필요 ${t.lowConfidence}개 포함` : "", tone: "white" };
    case "missing_required":
      return { main: "없음", sub: "설치 필요 · 누락 의심", tone: "red" };
    case "missing_not_required":
      return { main: "없음", sub: "설치 대상 아님", tone: "gray" };
    case "pending":
      return { main: "판정 보류", sub: t.note || "건물 정보 확인 전", tone: "amber" };
    case "elsewhere":
      return { main: "0개", sub: t.note, tone: "gray" };
  }
}

export function TallyPanel({
  tallies,
  highlightKind,
  onToggleKind,
}: {
  tallies: Tally[];
  highlightKind: ObjectKind | null;
  onToggleKind: (k: ObjectKind) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {CATS.map((cat) => {
        const rows = tallies.filter((t) => OBJECT_CATALOG[t.kind].category === cat);
        if (rows.length === 0) return null;
        return (
          <div key={cat}>
            <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{CATEGORY_LABELS[cat]}</p>
            <ul className="overflow-hidden rounded-lg border border-gray-800">
              {rows.map((t) => {
                const info = OBJECT_CATALOG[t.kind];
                const st = statusText(t);
                const active = highlightKind === t.kind;
                return (
                  <li key={t.kind} className="border-t border-gray-800 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => onToggleKind(t.kind)}
                      disabled={t.count === 0}
                      className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-default ${active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"} ${t.status === "missing_not_required" ? "opacity-55" : ""}`}
                      aria-pressed={active}
                    >
                      <ColorChip color={info.color} abbr={info.abbr} />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-100">{info.label}</span>
                      <span className="text-right">
                        <span
                          className={`block text-sm font-semibold tabular-nums ${st.tone === "red" ? "text-red-400" : st.tone === "gray" ? "text-gray-400" : st.tone === "amber" ? "text-amber-300" : "text-white"}`}
                        >
                          {st.main}
                        </span>
                        {st.sub && <span className={`block text-[11px] ${st.tone === "red" ? "text-red-300/80" : "text-gray-500"}`}>{st.sub}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
