"use client";

import { useState } from "react";
import { requestGuide } from "@/lib/client/api";
import { FINDING_ACTION_LABELS, FINDING_TYPE_LABELS, FINDING_TYPE_ORDER, type FindingActionStatus, type FindingType, type Project } from "@/lib/domain/types";
import type { Finding } from "@/lib/engine/review";
import { useAiStatus } from "./ai-status";
import { Chip, FINDING_DOT, FINDING_TONE, ghostBtn, Spinner } from "./ui";

export function FindingsPanel({
  findings,
  project,
  activeKey,
  onActivate,
  updateProject,
}: {
  findings: Finding[];
  project: Project;
  activeKey: string | null;
  onActivate: (f: Finding) => void;
  updateProject: (fn: (p: Project) => Project) => void;
}) {
  const [filter, setFilter] = useState<FindingType | "all">("all");
  const counts = Object.fromEntries(FINDING_TYPE_ORDER.map((t) => [t, findings.filter((f) => f.type === t).length])) as Record<FindingType, number>;
  const shown = filter === "all" ? findings : findings.filter((f) => f.type === filter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          전체 {findings.length}
        </FilterChip>
        {FINDING_TYPE_ORDER.map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)} dot={FINDING_DOT[t]} disabled={counts[t] === 0}>
            {FINDING_TYPE_LABELS[t]} {counts[t]}
          </FilterChip>
        ))}
      </div>
      {shown.length === 0 && <p className="rounded-lg border border-gray-800 px-3 py-6 text-center text-sm text-gray-500">해당하는 지적 사항이 없습니다.</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((f) => (
          <FindingItem key={f.key} finding={f} project={project} active={f.key === activeKey} onActivate={() => onActivate(f)} updateProject={updateProject} />
        ))}
      </ul>
    </div>
  );
}

function FilterChip({ active, onClick, children, dot, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; dot?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-default disabled:opacity-40 ${active ? "border-white bg-white text-black" : "border-gray-700 text-gray-300 hover:bg-gray-800/60"}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />}
      {children}
    </button>
  );
}

function FindingItem({
  finding: f,
  project,
  active,
  onActivate,
  updateProject,
}: {
  finding: Finding;
  project: Project;
  active: boolean;
  onActivate: () => void;
  updateProject: (fn: (p: Project) => Project) => void;
}) {
  const ai = useAiStatus();
  const action = project.findingActions[f.key];
  const status: FindingActionStatus = action?.status ?? "open";
  const aiGuide = project.guideTexts[f.key];
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideNote, setGuideNote] = useState<string | null>(null);

  const setAction = (patch: Partial<{ status: FindingActionStatus; memo: string }>) =>
    updateProject((p) => ({
      ...p,
      findingActions: {
        ...p.findingActions,
        [f.key]: { status: patch.status ?? p.findingActions[f.key]?.status ?? "open", memo: patch.memo ?? p.findingActions[f.key]?.memo ?? "", updatedAt: new Date().toISOString() },
      },
    }));

  const refine = async () => {
    setGuideBusy(true);
    setGuideNote(null);
    try {
      const res = await requestGuide({
        title: f.title,
        typeLabel: FINDING_TYPE_LABELS[f.type],
        floorLabel: f.floorLabel,
        roomName: f.roomName,
        content: f.content,
        measured: f.measured,
        criterion: f.criterion,
        templateGuide: f.guide,
        citation: { law: f.citation.law, short: f.citation.short, article: f.citation.article, title: f.citation.title },
        standardDate: project.standardDate,
        facts: f.facts,
      });
      if (res.grounded) {
        updateProject((p) => ({ ...p, guideTexts: { ...p.guideTexts, [f.key]: { text: res.text, model: res.model ?? "", at: new Date().toISOString() } } }));
      } else {
        setGuideNote(`근거 검증을 통과하지 못해 규칙 엔진 문장을 유지했습니다. (${res.reason})`);
      }
    } catch (e) {
      setGuideNote(e instanceof Error ? e.message : "가이드를 만들지 못했습니다.");
    } finally {
      setGuideBusy(false);
    }
  };

  return (
    <li className={`rounded-lg border transition-colors ${active ? "border-orange-500/60 bg-orange-500/[0.04]" : "border-gray-800 hover:border-gray-700"}`}>
      <button type="button" onClick={onActivate} className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left" aria-expanded={active}>
        <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white" style={{ backgroundColor: FINDING_DOT[f.type] }}>
          {f.no}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-gray-100">{f.title}</span>
            <Chip tone={FINDING_TONE[f.type]}>{FINDING_TYPE_LABELS[f.type]}</Chip>
            {status !== "open" && <Chip tone={status === "confirmed" ? "green" : status === "disputed" ? "blue" : "gray"}>{FINDING_ACTION_LABELS[status]}</Chip>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {[f.floorLabel ?? "건물 전체", f.roomName].filter(Boolean).join(" · ")}
            {f.measured && f.criterion ? ` · ${f.measured} (기준 ${f.criterion})` : ""}
          </span>
        </span>
      </button>

      {active && (
        <div className="space-y-3 border-t border-gray-800 px-3 pb-3 pt-3 text-sm">
          <p className="leading-relaxed text-gray-200">{f.content}</p>
          {(f.measured || f.criterion) && (
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-white/[0.03] px-2.5 py-2">
                <dt className="text-gray-500">측정값</dt>
                <dd className="mt-0.5 font-semibold text-white">{f.measured ?? "-"}</dd>
              </div>
              <div className="rounded-md bg-white/[0.03] px-2.5 py-2">
                <dt className="text-gray-500">기준값</dt>
                <dd className="mt-0.5 font-semibold text-white">{f.criterion ?? "-"}</dd>
              </div>
            </dl>
          )}
          <div>
            <p className="text-xs font-medium text-gray-400">수정 가이드{aiGuide ? " (AI 문장 · 근거 검증 통과)" : ""}</p>
            <p className="mt-1 leading-relaxed text-gray-200">{aiGuide?.text ?? f.guide}</p>
            {guideNote && <p className="mt-1 text-xs text-amber-300">{guideNote}</p>}
            {ai?.ai && (
              <button type="button" className={`${ghostBtn} mt-2 h-7 text-xs`} onClick={refine} disabled={guideBusy}>
                {guideBusy && <Spinner />}
                {aiGuide ? "AI로 다시 다듬기" : "AI로 문장 다듬기"}
              </button>
            )}
          </div>
          <div className="rounded-md border border-gray-800 px-2.5 py-2 text-xs">
            <p className="text-gray-400">근거</p>
            <p className="mt-0.5 text-gray-200">
              {f.citation.law} {f.citation.article}
            </p>
            <p className="mt-0.5 text-gray-500">{f.citation.title}</p>
            <p className="mt-1 text-gray-500">
              대조 버전 {f.citation.checkedVersion} · 기준일 {project.standardDate}
              {!f.citation.verified && <span className="text-amber-300"> · 원문 대조 전 기준</span>}
            </p>
            {f.citation.url && (
              <a href={f.citation.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-orange-300 hover:underline">
                국가법령정보센터에서 보기
              </a>
            )}
          </div>
          <p className="text-[11px] text-gray-500">판정 신뢰도 {Math.round(f.confidence * 100)}% · 규칙 {f.ruleId}</p>
          <div>
            <div className="flex flex-wrap gap-1.5">
              {(["confirmed", "hold", "disputed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAction({ status: status === s ? "open" : s })}
                  className={`h-7 cursor-pointer rounded-md border px-2.5 text-xs ${status === s ? "border-white bg-white text-black" : "border-gray-700 text-gray-300 hover:bg-gray-800/60"}`}
                >
                  {FINDING_ACTION_LABELS[s]}
                </button>
              ))}
            </div>
            <textarea
              className="mt-2 w-full rounded-md border border-gray-700 bg-gray-950 px-2.5 py-2 text-xs text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
              rows={2}
              placeholder="메모 (예: 설치 제외 장소에 해당, 협력업체 확인 요청)"
              defaultValue={action?.memo ?? ""}
              onBlur={(e) => e.target.value !== (action?.memo ?? "") && setAction({ memo: e.target.value })}
            />
          </div>
        </div>
      )}
    </li>
  );
}
