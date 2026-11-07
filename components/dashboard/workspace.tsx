"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeImage, ApiError } from "@/lib/client/api";
import { applyAnalysis, draftBuilding } from "@/lib/client/model";
import { useProject } from "@/lib/client/use-project";
import type { Sheet } from "@/lib/domain/types";
import { reviewProject } from "@/lib/engine/review";
import { db } from "@/lib/storage/db";
import { useAiStatus } from "./ai-status";
import { BuildingStep } from "./steps/building-step";
import { ResultsStep } from "./steps/results-step";
import { ScaleStep } from "./steps/scale-step";
import { UploadStep } from "./steps/upload-step";
import { CheckMark, Chip, primaryBtn, Spinner } from "./ui";

export type StepId = "upload" | "scale" | "building" | "results";

const STEPS: { id: StepId; label: string }[] = [
  { id: "upload", label: "도면 업로드" },
  { id: "scale", label: "축척 확인" },
  { id: "building", label: "건물 정보" },
  { id: "results", label: "검토 결과" },
];

export type ProjectApi = ReturnType<typeof useProject> & {
  runAnalysis: (sheetIds: string[]) => void;
  analyzing: Set<string>;
  goTo: (s: StepId) => void;
};

export function Workspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const api = useProject(projectId);
  const { project, sheets, status, updateProject, updateSheet, sheetsRef } = api;
  const ai = useAiStatus();
  const [step, setStep] = useState<StepId | null>(null);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const queue = useRef<Promise<void>>(Promise.resolve());

  const plans = sheets.filter((s) => s.kind === "floor_plan");
  const done = {
    upload: sheets.length > 0 && sheets.every((s) => s.analysis.status === "done"),
    scale: plans.length > 0 && plans.every((s) => s.scale.confirmed),
    building: !!project?.building.confirmed,
    results: false,
  };

  // 처음 열 때 진행 상황에 맞는 단계로 (한 번만 정한다)
  if (status === "ready" && step === null) {
    setStep(sheets.length === 0 ? "upload" : !done.scale ? "scale" : !done.building ? "building" : "results");
  }

  const runAnalysis = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        setAnalyzing((s) => new Set(s).add(id));
        updateSheet(id, (sh) => ({ ...sh, analysis: { ...sh.analysis, status: "running", error: undefined, startedAt: new Date().toISOString() } }));
        queue.current = queue.current.then(async () => {
          const sheet = sheetsRef.current.find((s) => s.id === id);
          if (!sheet) return;
          const started = new Date().toISOString();
          try {
            const blob = await db.getImage(sheet.imageKey);
            if (!blob) throw new Error("도면 이미지를 찾지 못했습니다.");
            const out = await analyzeImage(blob, sheet.quality.dpi);
            updateSheet(id, (sh) => applyAnalysis(sh, out, started));
            updateProject((p) => ({ ...p, building: draftBuilding(p.building, sheetsRef.current) }));
          } catch (e) {
            const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "분석 실패";
            updateSheet(id, (sh) => ({ ...sh, analysis: { ...sh.analysis, status: "error", error: msg } }));
          } finally {
            setAnalyzing((s) => {
              const n = new Set(s);
              n.delete(id);
              return n;
            });
          }
        });
      }
    },
    [updateSheet, updateProject, sheetsRef],
  );

  // 새로고침 등으로 끊긴 분석은 오류로 되돌린다
  useEffect(() => {
    if (status !== "ready") return;
    for (const s of sheetsRef.current) {
      if (s.analysis.status === "running") {
        updateSheet(s.id, (sh) => ({ ...sh, analysis: { ...sh.analysis, status: "error", error: "분석이 중단되었습니다. 다시 실행하십시오." } }));
      }
    }
  }, [status, sheetsRef, updateSheet]);

  const review = project ? reviewProject(project, sheets) : null;

  if (status === "loading" || !step) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-400">
        <Spinner /> 프로젝트를 여는 중
      </div>
    );
  }
  if (status === "missing" || !project || !review) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-gray-400">
        <p>이 브라우저에서 프로젝트를 찾지 못했습니다.</p>
        <Link href="/dashboard" className={primaryBtn}>
          프로젝트 목록으로
        </Link>
      </div>
    );
  }

  const full: ProjectApi = { ...api, runAnalysis, analyzing, goTo: setStep };
  const counts = { violation: 0, missing: 0, check: 0, pending: 0 };
  for (const f of review.findings) counts[f.type]++;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-gray-800/60 bg-black print:hidden">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Link href="/dashboard" className="hover:text-gray-300">
                프로젝트
              </Link>
              <span>/</span>
            </div>
            <h1 className="truncate text-lg font-semibold">{project.name}</h1>
            <p className="text-xs text-gray-500">
              기준일 {project.standardDate} · 규칙 {review.ruleSetVersion ?? "없음"} · 도면 {sheets.length}장
              {ai && !ai.ai && <span className="text-gray-400"> · AI 없이 수동 입력 모드</span>}
            </p>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto" aria-label="검토 단계">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const ok = done[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${active ? "bg-white text-black" : "text-gray-400 hover:bg-gray-800/60 hover:text-white"}`}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${active ? "bg-black text-white" : ok ? "bg-orange-500 text-black" : "bg-gray-800 text-gray-400"}`}
                  >
                    {ok && !active ? <CheckMark /> : i + 1}
                  </span>
                  {s.label}
                  {s.id === "results" && review.findings.length > 0 && (
                    <Chip tone={counts.violation ? "red" : counts.missing ? "orange" : "gray"} className="ml-0.5">
                      {review.findings.length}
                    </Chip>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {step === "upload" && <UploadStep api={full} />}
      {step === "scale" && <ScaleStep api={full} />}
      {step === "building" && <BuildingStep api={full} review={review} />}
      {step === "results" && <ResultsStep api={full} review={review} />}
    </div>
  );
}

export function planSheets(sheets: Sheet[]): Sheet[] {
  return sheets.filter((s) => s.kind === "floor_plan");
}
