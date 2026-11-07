"use client";

import Link from "next/link";
import { useState } from "react";
import { useImageUrl } from "@/lib/client/use-project";
import { FACILITY_KINDS, OBJECT_CATALOG, OBJECT_KINDS, ROOM_USE_LABELS, roomUseFromName, type ObjectKind } from "@/lib/domain/catalog";
import type { Box, Detection } from "@/lib/domain/types";
import { LOW_CONFIDENCE, type Finding, type ReviewResult } from "@/lib/engine/review";
import { uid } from "@/lib/storage/db";
import { DrawingViewer, type ViewerFinding } from "../drawing-viewer";
import { FindingsPanel } from "../findings-panel";
import { TallyPanel } from "../tally-panel";
import { Card, ColorChip, Disclaimer, Field, ghostBtn, inputCls, primaryBtn } from "../ui";
import type { ProjectApi } from "../workspace";

export function ResultsStep({ api, review }: { api: ProjectApi; review: ReviewResult }) {
  const { project, sheets, updateSheet, updateProject, goTo } = api;
  const plans = sheets.filter((s) => s.kind === "floor_plan");
  const [sheetId, setSheetId] = useState<string | null>(plans[0]?.id ?? null);
  const sheet = plans.find((s) => s.id === sheetId) ?? plans[0] ?? null;
  const url = useImageUrl(sheet?.imageKey);

  const [tab, setTab] = useState<"tally" | "findings">("findings");
  const [tallyScope, setTallyScope] = useState<"floor" | "total">("floor");
  const [hidden, setHidden] = useState<Set<ObjectKind>>(new Set(["window"]));
  const [highlight, setHighlight] = useState<{ kind: ObjectKind; index: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ box: Box; nonce: number } | null>(null);
  const [mode, setMode] = useState<"view" | "add">("view");
  const [addKind, setAddKind] = useState<ObjectKind>("extinguisher");
  const [layersOpen, setLayersOpen] = useState(false);

  const focusOn = (box: Box) => setFocus((f) => ({ box, nonce: (f?.nonce ?? 0) + 1 }));

  // 도면을 바꾸면 선택 상태를 초기화 (렌더링 중 조건부 갱신)
  const [shownSheet, setShownSheet] = useState(sheet?.id);
  if (shownSheet !== sheet?.id) {
    setShownSheet(sheet?.id);
    setSelectedId(null);
    setHighlight(null);
  }

  const sheetFindings: ViewerFinding[] = review.findings
    .filter((f) => f.sheetId === sheet?.id && f.location)
    .map((f) => ({ key: f.key, no: f.no, type: f.type, title: f.title, location: f.location! }));
  const related = new Map<string, number[]>();
  for (const f of review.findings) for (const id of f.targetIds) related.set(id, [...(related.get(id) ?? []), f.no]);

  if (!project) return null;
  if (!sheet) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-gray-400">
        검토할 평면도가 없습니다.
        <div className="mt-4">
          <button type="button" className={ghostBtn} onClick={() => goTo("upload")}>
            도면 업로드로
          </button>
        </div>
      </div>
    );
  }

  const tallies = tallyScope === "floor" ? (review.sheets.find((s) => s.sheetId === sheet.id)?.tallies ?? []) : review.totals;
  const selected = sheet.detections.find((d) => d.id === selectedId) ?? null;
  const ofKind = highlight
    ? sheet.detections.filter((d) => d.kind === highlight.kind).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    : [];

  const setDetections = (fn: (list: Detection[]) => Detection[]) =>
    updateSheet(sheet.id, (sh) => ({ ...sh, detections: fn(sh.detections), analysis: { ...sh.analysis, status: "done" } }));

  const activate = (f: Finding) => {
    if (activeKey === f.key) {
      setActiveKey(null);
      return;
    }
    setActiveKey(f.key);
    if (f.sheetId && f.sheetId !== sheet.id) setSheetId(f.sheetId);
    if (f.location) setTimeout(() => focusOn(f.location!), f.sheetId !== sheet.id ? 120 : 0);
  };

  const cycle = (dir: 1 | -1) => {
    if (!highlight || ofKind.length === 0) return;
    const index = (highlight.index + dir + ofKind.length) % ofKind.length;
    setHighlight({ ...highlight, index });
    setSelectedId(ofKind[index].id);
    focusOn(ofKind[index].box);
  };

  const sheetFindingCount = review.findings.filter((f) => f.sheetId === sheet.id).length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="층">
          {plans.map((s) => {
            const n = review.findings.filter((f) => f.sheetId === s.id && (f.type === "violation" || f.type === "missing")).length;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === sheet.id}
                onClick={() => setSheetId(s.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${s.id === sheet.id ? "border-white bg-white text-black" : "border-gray-700 text-gray-300 hover:bg-gray-800/60"}`}
              >
                {s.floorLabel}
                {n > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" className={ghostBtn} onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen}>
              표시할 종류 ({OBJECT_KINDS.length - hidden.size}/{OBJECT_KINDS.length})
            </button>
            {layersOpen && (
              <div className="absolute right-0 top-10 z-30 w-64 rounded-lg border border-gray-700 bg-gray-950 p-2 shadow-2xl">
                <div className="mb-1 flex justify-between px-1 text-xs">
                  <button type="button" className="cursor-pointer text-gray-400 hover:text-white" onClick={() => setHidden(new Set())}>
                    모두 표시
                  </button>
                  <button type="button" className="cursor-pointer text-gray-400 hover:text-white" onClick={() => setHidden(new Set(OBJECT_KINDS))}>
                    모두 숨김
                  </button>
                </div>
                <ul className="max-h-80 overflow-auto">
                  {OBJECT_KINDS.map((k) => (
                    <li key={k}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-white/5">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-orange-500"
                          checked={!hidden.has(k)}
                          onChange={(e) => {
                            const n = new Set(hidden);
                            if (e.target.checked) n.delete(k);
                            else n.add(k);
                            setHidden(n);
                          }}
                        />
                        <ColorChip color={OBJECT_CATALOG[k].color} abbr={OBJECT_CATALOG[k].abbr} />
                        <span className="text-gray-200">{OBJECT_CATALOG[k].label}</span>
                        <span className="ml-auto text-xs text-gray-500">{sheet.detections.filter((d) => d.kind === k).length}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className={`flex items-center gap-1 rounded-md border ${mode === "add" ? "border-orange-500" : "border-gray-700"}`}>
            <button
              type="button"
              className={`h-9 cursor-pointer rounded-l-md px-3 text-sm ${mode === "add" ? "bg-orange-500 text-black" : "text-gray-200 hover:bg-gray-800/60"}`}
              onClick={() => setMode((m) => (m === "add" ? "view" : "add"))}
              aria-pressed={mode === "add"}
            >
              {mode === "add" ? "박스 추가 중" : "박스 추가"}
            </button>
            <select
              className="h-9 rounded-r-md border-l border-gray-700 bg-transparent px-2 text-sm text-gray-200 [color-scheme:dark] focus:outline-none"
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as ObjectKind)}
              aria-label="추가할 종류"
            >
              {OBJECT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {OBJECT_CATALOG[k].label}
                </option>
              ))}
            </select>
          </div>
          <Link href={`/dashboard/projects/${project.id}/report`} className={primaryBtn}>
            리포트 내보내기
          </Link>
        </div>
      </div>

      <div className="grid flex-1 gap-3 lg:grid-cols-[1fr_420px]">
        <Card className="relative min-h-[560px] overflow-hidden">
          <DrawingViewer
            className="absolute inset-0"
            imageUrl={url}
            width={sheet.width}
            height={sheet.height}
            detections={sheet.detections}
            hiddenKinds={hidden}
            highlightKind={highlight?.kind ?? null}
            selectedId={selectedId}
            findings={sheetFindings}
            activeFindingKey={activeKey}
            focus={focus}
            mode={mode}
            relatedFindings={related}
            onSelect={setSelectedId}
            onFindingClick={(key) => {
              const f = review.findings.find((x) => x.key === key);
              if (f) {
                setTab("findings");
                activate(f);
              }
            }}
            onAdd={(box) => {
              const d: Detection = {
                id: uid(addKind),
                kind: addKind,
                box,
                confidence: 1,
                source: "user",
                label: addKind === "room" ? "새 실" : undefined,
                roomUse: addKind === "room" ? "habitable" : undefined,
              };
              setDetections((list) => [...list, d]);
              setSelectedId(d.id);
            }}
          />
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
            <span className="rounded-md bg-black/75 px-2 py-1 text-xs text-gray-200">
              {sheet.floorLabel} · 객체 {sheet.detections.length}개 · 지적 {sheetFindingCount}건
              {!sheet.scale.confirmed && <span className="text-amber-300"> · 축척 미확정</span>}
            </span>
            {mode === "add" && <span className="rounded-md bg-orange-500 px-2 py-1 text-xs font-medium text-black">빈 곳을 드래그해 {OBJECT_CATALOG[addKind].label} 박스를 그리세요</span>}
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-3">
          {selected && (
            <SelectedEditor
              det={selected}
              related={related.get(selected.id) ?? []}
              onChange={(patch) => setDetections((list) => list.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)))}
              onDelete={() => {
                setDetections((list) => list.filter((d) => d.id !== selected.id));
                setSelectedId(null);
              }}
              onClose={() => setSelectedId(null)}
            />
          )}

          <Card className="flex min-h-0 flex-1 flex-col">
            <div className="flex border-b border-gray-800" role="tablist">
              {(
                [
                  ["findings", `지적 사항 ${review.findings.length}`],
                  ["tally", "종류별 집계"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex-1 cursor-pointer px-4 py-3 text-sm ${tab === id ? "border-b-2 border-orange-500 font-medium text-white" : "text-gray-400 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 lg:max-h-[calc(100vh-260px)]">
              {tab === "tally" ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex rounded-md border border-gray-700 p-0.5 text-xs">
                      {(
                        [
                          ["floor", `${sheet.floorLabel}`],
                          ["total", "전체"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setTallyScope(id)}
                          className={`cursor-pointer rounded px-3 py-1 ${tallyScope === id ? "bg-white text-black" : "text-gray-300"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {highlight && (
                      <div className="flex items-center gap-1 text-xs text-gray-300">
                        <button type="button" className={`${ghostBtn} h-7 px-2`} onClick={() => cycle(-1)}>
                          이전
                        </button>
                        <span className="tabular-nums">
                          {highlight.index + 1}/{ofKind.length}
                        </span>
                        <button type="button" className={`${ghostBtn} h-7 px-2`} onClick={() => cycle(1)}>
                          다음
                        </button>
                      </div>
                    )}
                  </div>
                  <TallyPanel
                    tallies={tallies.filter((t) => FACILITY_KINDS.includes(t.kind))}
                    highlightKind={highlight?.kind ?? null}
                    onToggleKind={(k) => {
                      if (highlight?.kind === k) {
                        setHighlight(null);
                        return;
                      }
                      setHighlight({ kind: k, index: -1 });
                      const n = new Set(hidden);
                      n.delete(k);
                      setHidden(n);
                    }}
                  />
                </>
              ) : (
                <FindingsPanel findings={review.findings} project={project} activeKey={activeKey} onActivate={activate} updateProject={updateProject} />
              )}
              <Disclaimer className="mt-4 px-1" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SelectedEditor({
  det,
  related,
  onChange,
  onDelete,
  onClose,
}: {
  det: Detection;
  related: number[];
  onChange: (patch: Partial<Detection>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const info = OBJECT_CATALOG[det.kind];
  const low = det.confidence < LOW_CONFIDENCE;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ColorChip color={info.color} abbr={info.abbr} />
          <span className="text-sm font-medium">선택한 객체</span>
          <span className="text-xs text-gray-500">
            {det.source === "ai" ? "AI 인식" : det.source === "sample" ? "샘플" : "사용자 입력"} · 신뢰도 {Math.round(det.confidence * 100)}%
          </span>
        </div>
        <button type="button" className="cursor-pointer text-xs text-gray-400 hover:text-white" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="종류">
          <select className={`${inputCls} h-9`} value={det.kind} onChange={(e) => onChange({ kind: e.target.value as ObjectKind })}>
            {OBJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {OBJECT_CATALOG[k].label}
              </option>
            ))}
          </select>
        </Field>
        {det.kind === "room" ? (
          <Field label={`실 이름 · ${ROOM_USE_LABELS[det.roomUse ?? roomUseFromName(det.label)]}`}>
            <input className={`${inputCls} h-9`} value={det.label ?? ""} onChange={(e) => onChange({ label: e.target.value, roomUse: roomUseFromName(e.target.value) })} />
          </Field>
        ) : (
          <div className="flex items-end">
            {low && (
              <button type="button" className={`${ghostBtn} w-full`} onClick={() => onChange({ confidence: 1, source: "user" })}>
                맞음으로 확인
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">{related.length ? `관련 지적 ${related.map((n) => `#${n}`).join(", ")}` : "관련 지적 없음"}</span>
        <button type="button" className="h-7 cursor-pointer rounded-md border border-red-500/40 px-2.5 text-xs text-red-300 hover:bg-red-500/10" onClick={onDelete}>
          삭제
        </button>
      </div>
    </Card>
  );
}
