"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { OBJECT_CATALOG, type ObjectKind } from "@/lib/domain/catalog";
import type { Box, Detection, FindingType, Point } from "@/lib/domain/types";
import { FINDING_TYPE_LABELS } from "@/lib/domain/types";
import { LOW_CONFIDENCE } from "@/lib/engine/review";

export interface ViewerFinding {
  key: string;
  no: number;
  type: FindingType;
  title: string;
  location: Box;
}

export interface ViewerProps {
  imageUrl: string | null;
  width: number;
  height: number;
  detections: Detection[];
  hiddenKinds?: Set<ObjectKind>;
  highlightKind?: ObjectKind | null;
  selectedId?: string | null;
  findings?: ViewerFinding[];
  activeFindingKey?: string | null;
  /** nonce가 바뀔 때마다 해당 영역으로 이동 */
  focus?: { box: Box; nonce: number } | null;
  mode?: "view" | "add" | "calibrate";
  calibrationPoints?: Point[];
  /** 박스 위에 마우스를 올렸을 때 보여줄 관련 지적 번호 */
  relatedFindings?: Map<string, number[]>;
  onSelect?: (id: string | null) => void;
  onAdd?: (box: Box) => void;
  onCalibratePoint?: (p: Point) => void;
  onFindingClick?: (key: string) => void;
  className?: string;
}

interface View {
  s: number;
  tx: number;
  ty: number;
}

const MIN_S = 0.02;
const MAX_S = 4;

export function DrawingViewer({
  imageUrl,
  width: W,
  height: H,
  detections,
  hiddenKinds,
  highlightKind = null,
  selectedId = null,
  findings = [],
  activeFindingKey = null,
  focus = null,
  mode = "view",
  calibrationPoints = [],
  relatedFindings,
  onSelect,
  onAdd,
  onCalibratePoint,
  onFindingClick,
  className = "",
}: ViewerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: 0.1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean; target: Element | null; start: Point } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const [fittedFor, setFittedFor] = useState("");
  const [focusNonce, setFocusNonce] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitView = (): View => {
    const s = Math.min(size.w / W, size.h / H) * 0.96;
    return { s, tx: (size.w - W * s) / 2, ty: (size.h - H * s) / 2 };
  };
  const fit = () => size.w && size.h && setView(fitView());

  // 도면이 바뀌거나 처음 크기가 잡히면 화면에 맞춘다 (렌더링 중 조건부 갱신)
  // 도면 크기가 바뀔 때만 맞춘다. 같은 크기 층을 오갈 때는 확대 상태를 유지하고, 이미지 로드가 늦어도 포커스 이동을 덮어쓰지 않는다
  const fitKey = `${W}x${H}`;
  if (size.w && size.h && fittedFor !== fitKey) {
    setFittedFor(fitKey);
    setView(fitView());
  }

  // focus.nonce가 바뀌면 그 영역으로 이동
  if (focus && size.w && size.h && focus.nonce !== focusNonce) {
    setFocusNonce(focus.nonce);
    const b = focus.box;
    const fitS = Math.min(size.w / W, size.h / H) * 0.96;
    const s = Math.max(fitS, Math.min(size.w / (b.w * 3), size.h / (b.h * 3), 1.2));
    setView({ s, tx: size.w / 2 - (b.x + b.w / 2) * s, ty: size.h / 2 - (b.y + b.h / 2) * s });
  }

  // 휠 확대: 커서 위치를 기준으로
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = viewRef.current;
      const ns = Math.min(MAX_S, Math.max(MIN_S, v.s * Math.exp(-e.deltaY * 0.0015)));
      setView({ s: ns, tx: mx - (mx - v.tx) * (ns / v.s), ty: my - (my - v.ty) * (ns / v.s) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toImage = (clientX: number, clientY: number): Point => {
    const rect = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.tx) / v.s, y: (clientY - rect.top - v.ty) / v.s };
  };

  const zoomBy = (k: number) => {
    const v = viewRef.current;
    const ns = Math.min(MAX_S, Math.max(MIN_S, v.s * k));
    const cx = size.w / 2;
    const cy = size.h / 2;
    setView({ s: ns, tx: cx - (cx - v.tx) * (ns / v.s), ty: cy - (cy - v.ty) * (ns / v.s) });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, target: e.target as Element, start: toImage(e.clientX, e.clientY) };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (mode === "add") {
      const p = toImage(e.clientX, e.clientY);
      setDraft({ x: Math.min(p.x, d.start.x), y: Math.min(p.y, d.start.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) });
    } else {
      setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (mode === "add" && d.moved && draft) {
      if (draft.w * view.s > 4 && draft.h * view.s > 4) onAdd?.({ x: Math.round(draft.x), y: Math.round(draft.y), w: Math.round(draft.w), h: Math.round(draft.h) });
      setDraft(null);
      return;
    }
    setDraft(null);
    if (d.moved) return;
    if (mode === "calibrate") {
      onCalibratePoint?.(toImage(e.clientX, e.clientY));
      return;
    }
    const det = d.target?.closest("[data-det-id]")?.getAttribute("data-det-id");
    const fk = d.target?.closest("[data-finding-key]")?.getAttribute("data-finding-key");
    if (fk && !det) onFindingClick?.(fk);
    else onSelect?.(det ?? null);
  };

  const s = view.s;
  const sw = 1.6 / s;
  const fs = 10 / s;
  const visible = detections.filter((d) => !hiddenKinds?.has(d.kind));
  // 실은 아래, 선택한 객체는 맨 위에
  visible.sort((a, b) => Number(b.kind === "room") - Number(a.kind === "room") || Number(a.id === selectedId) - Number(b.id === selectedId));

  return (
    <div
      ref={ref}
      className={`select-none overflow-hidden bg-gray-950 ${mode === "view" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={fit}
      role="application"
      aria-label="도면 뷰어. 휠로 확대, 드래그로 이동, 두 번 클릭하면 화면에 맞춤"
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `translate(${view.tx}px, ${view.ty}px) scale(${s})` }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 사용자 기기에 저장된 blob URL이라 next/image 최적화 대상이 아니다
          <img src={imageUrl} alt="도면" draggable={false} width={W} height={H} className="block max-w-none bg-white" style={{ width: W, height: H }} />
        ) : (
          <div className="bg-white" style={{ width: W, height: H }} />
        )}
        <svg className="absolute left-0 top-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {visible.map((d) => {
            const info = OBJECT_CATALOG[d.kind];
            const room = d.kind === "room";
            const low = d.confidence < LOW_CONFIDENCE;
            const dim = highlightKind && d.kind !== highlightKind;
            const sel = d.id === selectedId;
            const rel = relatedFindings?.get(d.id);
            const tag = room ? d.label || "실" : info.abbr;
            return (
              <g key={d.id} data-det-id={d.id} opacity={dim ? 0.18 : 1} className="cursor-pointer">
                <title>{`${info.label}${d.label ? ` · ${d.label}` : ""} · 신뢰도 ${Math.round(d.confidence * 100)}%${low ? " (확인 필요)" : ""}${rel?.length ? ` · 관련 지적 ${rel.map((n) => `#${n}`).join(", ")}` : ""}`}</title>
                {sel && <rect x={d.box.x - 3 / s} y={d.box.y - 3 / s} width={d.box.w + 6 / s} height={d.box.h + 6 / s} fill="none" stroke="#fff" strokeWidth={4 / s} />}
                <rect
                  x={d.box.x}
                  y={d.box.y}
                  width={d.box.w}
                  height={d.box.h}
                  fill={room ? "transparent" : info.color}
                  fillOpacity={room ? 0 : 0.1}
                  stroke={info.color}
                  strokeOpacity={room ? 0.55 : 1}
                  strokeWidth={(sel ? 2.6 : room ? 1.2 : 1.6) / s}
                  strokeDasharray={low ? `${6 / s} ${4 / s}` : undefined}
                />
                <g transform={`translate(${room ? d.box.x + 4 / s : d.box.x} ${room ? d.box.y + 4 / s : d.box.y - fs * 1.35})`}>
                  <rect width={fs * (0.62 * [...tag].length + 0.8)} height={fs * 1.35} rx={2 / s} fill={info.color} opacity={room ? 0.75 : 0.95} />
                  <text x={fs * 0.4} y={fs * 1.02} fontSize={fs} fill="#fff" fontWeight={700}>
                    {tag}
                  </text>
                </g>
              </g>
            );
          })}
          {findings.map((f) => {
            const active = f.key === activeFindingKey;
            const color = active ? "#f97316" : "#ef4444";
            const r = 11 / s;
            return (
              <g key={f.key} data-finding-key={f.key} className="cursor-pointer">
                <title>{`#${f.no} ${FINDING_TYPE_LABELS[f.type]} · ${f.title}`}</title>
                <rect
                  x={f.location.x}
                  y={f.location.y}
                  width={f.location.w}
                  height={f.location.h}
                  fill={color}
                  fillOpacity={active ? 0.1 : 0.05}
                  stroke={color}
                  strokeWidth={(active ? 3 : 2) / s}
                  strokeDasharray={`${9 / s} ${6 / s}`}
                />
                <circle cx={f.location.x} cy={f.location.y} r={r} fill={color} stroke="#fff" strokeWidth={1.5 / s} />
                <text x={f.location.x} y={f.location.y} dy="0.35em" textAnchor="middle" fontSize={11 / s} fontWeight={700} fill="#fff">
                  {f.no}
                </text>
              </g>
            );
          })}
          {calibrationPoints.length > 0 && (
            <g>
              {calibrationPoints.length === 2 && (
                <line
                  x1={calibrationPoints[0].x}
                  y1={calibrationPoints[0].y}
                  x2={calibrationPoints[1].x}
                  y2={calibrationPoints[1].y}
                  stroke="#f97316"
                  strokeWidth={2.5 / s}
                />
              )}
              {calibrationPoints.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={7 / s} fill="#f97316" fillOpacity={0.25} stroke="#f97316" strokeWidth={2 / s} />
                  <circle cx={p.x} cy={p.y} r={1.8 / s} fill="#f97316" />
                </g>
              ))}
            </g>
          )}
          {draft && <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="#fff" fillOpacity={0.08} stroke="#111" strokeWidth={sw} strokeDasharray={`${5 / s} ${4 / s}`} />}
        </svg>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-gray-800 bg-black/80 p-1 text-xs text-gray-200 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="h-7 w-7 cursor-pointer rounded hover:bg-gray-800" onClick={() => zoomBy(1 / 1.4)} aria-label="축소">
          −
        </button>
        <span className="w-12 text-center tabular-nums">{Math.round(s * 100)}%</span>
        <button type="button" className="h-7 w-7 cursor-pointer rounded hover:bg-gray-800" onClick={() => zoomBy(1.4)} aria-label="확대">
          +
        </button>
        <button type="button" className="h-7 cursor-pointer rounded px-2 hover:bg-gray-800" onClick={fit}>
          맞춤
        </button>
      </div>
    </div>
  );
}
