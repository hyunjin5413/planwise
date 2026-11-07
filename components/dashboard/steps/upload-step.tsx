"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { ACCEPT, ingestFile } from "@/lib/client/ingest";
import { floorLabel, parseFloor } from "@/lib/client/model";
import { useImageUrl } from "@/lib/client/use-project";
import { OBJECT_CATALOG } from "@/lib/domain/catalog";
import { SHEET_KIND_LABELS, type Sheet, type SheetKind } from "@/lib/domain/types";
import { useAiStatus } from "../ai-status";
import { Card, Chip, ghostBtn, inputCls, primaryBtn, Spinner } from "../ui";
import type { ProjectApi } from "../workspace";

export function UploadStep({ api }: { api: ProjectApi }) {
  const { sheets, addPages, runAnalysis, goTo } = api;
  const ai = useAiStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    setErrors([]);
    const errs: string[] = [];
    const createdIds: string[] = [];
    for (const f of list) {
      setBusy(`${f.name} 읽는 중`);
      try {
        const pages = await ingestFile(f, setBusy);
        const created = await addPages(pages);
        createdIds.push(...created.map((c) => c.id));
      } catch (e) {
        errs.push(e instanceof Error ? e.message : `${f.name}: 읽지 못했습니다.`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (ai?.ai && createdIds.length) runAnalysis(createdIds);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void handleFiles(e.dataTransfer.files);
  };

  const idle = sheets.filter((s) => s.analysis.status === "idle" || s.analysis.status === "error");
  const readyForNext = sheets.length > 0 && sheets.every((s) => s.analysis.status === "done");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${over ? "border-orange-500 bg-orange-500/5" : "border-gray-700 bg-white/[0.02]"}`}
      >
        <UploadGlyph />
        <div>
          <p className="text-sm font-medium text-white">층별 평면도를 끌어다 놓거나 파일을 고르세요</p>
          <p className="mt-1 text-xs text-gray-500">PNG, JPG, TIFF, PDF · 여러 장 가능 · PDF는 쪽마다 한 장으로 나눕니다 · 300dpi 이상 권장</p>
        </div>
        <button type="button" className={primaryBtn} onClick={() => input.current?.click()} disabled={!!busy}>
          {busy ? <Spinner /> : null}
          {busy ?? "파일 선택"}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {ai && !ai.ai && (
        <p className="mt-4 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3 text-sm text-gray-300">
          {ai.state === "invalid_key" ? "API 키가 유효하지 않아" : "API 키가 설정되지 않아"} AI 인식을 쓸 수 없습니다. 도면을 올린 뒤
          <strong className="font-medium text-white"> 수동 입력</strong>으로 진행하면 검토 결과 화면에서 박스를 직접 그려 검토할 수 있습니다.
        </p>
      )}
      {errors.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {sheets.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">올린 도면 {sheets.length}장</h2>
            <div className="flex gap-2">
              {ai?.ai && idle.length > 0 && (
                <button type="button" className={ghostBtn} onClick={() => runAnalysis(idle.map((s) => s.id))}>
                  {idle.length}장 AI 분석
                </button>
              )}
              <button type="button" className={primaryBtn} onClick={() => goTo("scale")} disabled={!readyForNext}>
                다음: 축척 확인
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sheets.map((s) => (
              <SheetCard key={s.id} sheet={s} api={api} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SheetCard({ sheet: s, api }: { sheet: Sheet; api: ProjectApi }) {
  const url = useImageUrl(s.imageKey);
  const ai = useAiStatus();
  const { updateSheet, removeSheet, runAnalysis } = api;
  const facilities = s.detections.filter((d) => OBJECT_CATALOG[d.kind].facility).length;
  const rooms = s.detections.filter((d) => d.kind === "room").length;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-[1.414] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에 저장된 blob URL */}
        {url && <img src={url} alt={`${s.name} 미리보기`} className="h-full w-full object-contain" />}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-gray-200">
          {s.width.toLocaleString()}×{s.height.toLocaleString()}px{s.quality.dpi ? ` · ${s.quality.dpi}dpi` : ""}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="truncate text-sm font-medium" title={s.name}>
          {s.name}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select
            className={inputCls}
            value={s.kind}
            aria-label="시트 종류"
            onChange={(e) => updateSheet(s.id, (sh) => ({ ...sh, kind: e.target.value as SheetKind }))}
          >
            {Object.entries(SHEET_KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            value={s.floorLabel}
            aria-label="층"
            placeholder="예: 3층, 지하1층"
            onChange={(e) => {
              const v = e.target.value;
              updateSheet(s.id, (sh) => ({ ...sh, floorLabel: v, level: parseFloor(v) }));
            }}
            onBlur={() => updateSheet(s.id, (sh) => ({ ...sh, floorLabel: sh.level != null ? floorLabel(sh.level) : sh.floorLabel }))}
          />
        </div>
        {s.kind !== "floor_plan" && <p className="text-xs text-gray-500">MVP는 평면도만 판정합니다. 이 시트는 분류만 해 둡니다.</p>}
        {s.quality.issues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.quality.issues.map((q) => (
              <Chip key={q.code + q.message} tone={q.severity === "error" ? "red" : q.severity === "warn" ? "amber" : "gray"}>
                <span title={q.message}>{q.message}</span>
              </Chip>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-800 pt-3">
          <AnalysisStatus sheet={s} facilities={facilities} rooms={rooms} />
          <div className="flex shrink-0 gap-1.5">
            {s.analysis.status !== "running" && ai?.ai && (
              <button type="button" className={ghostBtn} onClick={() => runAnalysis([s.id])}>
                {s.analysis.status === "done" ? "다시 분석" : "AI 분석"}
              </button>
            )}
            {(s.analysis.status === "idle" || s.analysis.status === "error") && (
              <button
                type="button"
                className={ghostBtn}
                onClick={() => updateSheet(s.id, (sh) => ({ ...sh, analysis: { status: "done", source: "manual", finishedAt: new Date().toISOString() } }))}
              >
                수동 입력
              </button>
            )}
            <button
              type="button"
              className={ghostBtn}
              disabled={s.analysis.status === "running"}
              onClick={() => confirm(`'${s.name}' 도면을 삭제할까요?`) && void removeSheet(s.id)}
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AnalysisStatus({ sheet: s, facilities, rooms }: { sheet: Sheet; facilities: number; rooms: number }) {
  const [now, setNow] = useState(0);
  const running = s.analysis.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (running) {
    const sec = s.analysis.startedAt && now ? Math.max(0, Math.round((now - Date.parse(s.analysis.startedAt)) / 1000)) : 0;
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-300">
        <Spinner /> AI 분석 중 {sec > 0 && `${sec}초`}
      </span>
    );
  }
  if (s.analysis.status === "error") return <span className="text-xs text-red-300">{s.analysis.error}</span>;
  if (s.analysis.status === "idle") return <span className="text-xs text-gray-500">분석 전</span>;
  const src = s.analysis.source === "ai" ? "AI 인식" : s.analysis.source === "sample" ? "샘플 정답" : "수동 입력";
  return (
    <span className="text-xs text-gray-400">
      {src} · 시설 {facilities}개 · 실 {rooms}개
      {s.analysis.durationMs ? ` · ${Math.round(s.analysis.durationMs / 1000)}초` : ""}
    </span>
  );
}

function UploadGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="6" y="4" width="22" height="30" rx="2" stroke="#6b7280" strokeWidth="1.5" />
      <path d="M11 12h12M11 17h12M11 22h7" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="29" cy="29" r="8" fill="#000" stroke="#f97316" strokeWidth="1.5" />
      <path d="M29 33v-8M25.5 28.5 29 25l3.5 3.5" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
