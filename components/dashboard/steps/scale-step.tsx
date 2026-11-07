"use client";

import { useState } from "react";
import { useImageUrl } from "@/lib/client/use-project";
import type { Point, ScaleMethod, Sheet } from "@/lib/domain/types";
import { DrawingViewer } from "../drawing-viewer";
import { Card, Chip, Field, ghostBtn, inputCls, primaryBtn } from "../ui";
import type { ProjectApi } from "../workspace";

const METHOD_LABELS: Record<ScaleMethod, string> = {
  title_block: "표제란 축척",
  dimension: "치수선",
  calibration: "두 점 보정",
  pdf: "PDF 용지 크기",
  sample: "샘플 정답",
};

/** px/m와 dpi로 1:N 축척을 역산 */
function ratioOf(ppm: number, dpi: number | null): string | null {
  if (!dpi) return null;
  const n = (dpi / 25.4) * 1000 / ppm;
  return `약 1:${Math.round(n).toLocaleString("ko-KR")}`;
}

export function ScaleStep({ api }: { api: ProjectApi }) {
  const { sheets, goTo } = api;
  const plans = sheets.filter((s) => s.kind === "floor_plan");
  const [activeId, setActiveId] = useState<string | null>(plans[0]?.id ?? null);
  const active = plans.find((s) => s.id === activeId) ?? plans[0];

  if (!active) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-gray-400">
        평면도가 없습니다. 도면 업로드 단계에서 시트 종류를 평면도로 지정하십시오.
        <div className="mt-4">
          <button type="button" className={ghostBtn} onClick={() => goTo("upload")}>
            도면 업로드로
          </button>
        </div>
      </div>
    );
  }
  const allConfirmed = plans.every((s) => s.scale.confirmed);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {plans.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${s.id === active.id ? "border-white bg-white text-black" : "border-gray-700 text-gray-300 hover:bg-gray-800/60"}`}
            >
              {s.floorLabel}
              <span className={`h-1.5 w-1.5 rounded-full ${s.scale.confirmed ? "bg-green-500" : s.scale.needsCalibration ? "bg-amber-400" : "bg-gray-500"}`} />
            </button>
          ))}
        </div>
        <button type="button" className={primaryBtn} onClick={() => goTo("building")}>
          {allConfirmed ? "다음: 건물 정보" : "축척 없이 다음으로 (거리 판정 보류)"}
        </button>
      </div>
      <ScaleEditor key={active.id} sheet={active} api={api} plans={plans} />
    </div>
  );
}

function ScaleEditor({ sheet: s, api, plans }: { sheet: Sheet; api: ProjectApi; plans: Sheet[] }) {
  const url = useImageUrl(s.imageKey);
  const { updateSheet } = api;
  const [calibrating, setCalibrating] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [meters, setMeters] = useState("");
  const pxLen = points.length === 2 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : null;
  const est = s.scale.pxPerMeter;

  const confirmEstimate = () =>
    updateSheet(s.id, (sh) => ({ ...sh, scale: { ...sh.scale, confirmed: true, method: sh.scale.method ?? sh.scale.estimates[0]?.method ?? null } }));

  const applyCalibration = () => {
    const m = Number(meters.replace(/,/g, ""));
    if (!pxLen || !(m > 0)) return;
    const ppm = pxLen / m;
    updateSheet(s.id, (sh) => ({
      ...sh,
      scale: {
        ...sh.scale,
        pxPerMeter: ppm,
        confirmed: true,
        method: "calibration",
        needsCalibration: false,
        calibration: { p1: points[0], p2: points[1], meters: m },
        estimates: [...sh.scale.estimates.filter((e) => e.method !== "calibration"), { method: "calibration", pxPerMeter: ppm, note: `두 점 ${m}m = ${Math.round(pxLen)}px` }],
        note: "사용자가 두 점으로 보정했습니다.",
      },
    }));
    setCalibrating(false);
    setPoints([]);
  };

  const sameSize = plans.filter((p) => p.id !== s.id && p.width === s.width && p.height === s.height && !p.scale.confirmed);

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="relative min-h-[520px] overflow-hidden">
        <DrawingViewer
          className="absolute inset-0"
          imageUrl={url}
          width={s.width}
          height={s.height}
          detections={[]}
          mode={calibrating ? "calibrate" : "view"}
          calibrationPoints={points}
          onCalibratePoint={(p) => setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]))}
        />
        {calibrating && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/80 px-3 py-2 text-xs text-gray-200">
            길이를 아는 두 점을 클릭하세요 (예: 치수선 양 끝 눈금). {points.length}/2
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{s.floorLabel} 축척</h3>
            {s.scale.confirmed ? <Chip tone="green">확정</Chip> : s.scale.needsCalibration ? <Chip tone="amber">보정 필요</Chip> : <Chip>미확정</Chip>}
          </div>
          {est ? (
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {est.toFixed(1)}
              <span className="ml-1 text-sm font-normal text-gray-400">px/m</span>
              {ratioOf(est, s.quality.dpi) && <span className="ml-2 text-sm font-normal text-gray-400">{ratioOf(est, s.quality.dpi)}</span>}
            </p>
          ) : (
            <p className="mt-3 text-sm text-gray-400">추정한 축척이 없습니다.</p>
          )}
          {s.scale.ratioText && <p className="mt-1 text-xs text-gray-500">도면 표기 {s.scale.ratioText}</p>}
          {s.scale.note && <p className={`mt-3 text-xs leading-relaxed ${s.scale.needsCalibration ? "text-amber-300" : "text-gray-400"}`}>{s.scale.note}</p>}

          {s.scale.estimates.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-gray-800 pt-3">
              {s.scale.estimates.map((e) => (
                <li key={e.method} className="flex items-start justify-between gap-3 text-xs">
                  <div>
                    <p className="text-gray-200">{METHOD_LABELS[e.method]}</p>
                    {e.note && <p className="text-gray-500">{e.note}</p>}
                  </div>
                  <span className="shrink-0 tabular-nums text-gray-300">{e.pxPerMeter.toFixed(1)} px/m</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {!s.scale.confirmed && est && (
              <button type="button" className={primaryBtn} onClick={confirmEstimate}>
                추정 축척으로 확정
              </button>
            )}
            {s.scale.confirmed && (
              <button type="button" className={ghostBtn} onClick={() => updateSheet(s.id, (sh) => ({ ...sh, scale: { ...sh.scale, confirmed: false } }))}>
                확정 취소
              </button>
            )}
            <button
              type="button"
              className={ghostBtn}
              onClick={() => {
                setCalibrating((c) => !c);
                setPoints([]);
              }}
            >
              {calibrating ? "보정 취소" : "두 점으로 보정"}
            </button>
          </div>
          {s.scale.confirmed && sameSize.length > 0 && est && (
            <button
              type="button"
              className={`${ghostBtn} mt-2 w-full`}
              onClick={() => {
                for (const p of sameSize)
                  updateSheet(p.id, (sh) => ({ ...sh, scale: { ...sh.scale, pxPerMeter: est, confirmed: true, method: s.scale.method, note: `${s.floorLabel} 도면과 같은 축척을 적용했습니다.` } }));
              }}
            >
              같은 크기 도면 {sameSize.length}장에 같은 축척 적용
            </button>
          )}
        </Card>

        {calibrating && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold">두 점 보정</h3>
            <p className="mt-1 text-xs text-gray-400">도면에서 두 점을 찍고 실제 길이를 입력하세요. 도면을 끌어 이동하려면 보정을 잠시 끄세요.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="도면상 길이">
                <input className={inputCls} value={pxLen ? `${Math.round(pxLen)} px` : "두 점을 찍으세요"} disabled />
              </Field>
              <Field label="실제 길이 (m)">
                <input className={inputCls} inputMode="decimal" value={meters} onChange={(e) => setMeters(e.target.value)} placeholder="예: 30" />
              </Field>
            </div>
            <button type="button" className={`${primaryBtn} mt-3 w-full`} disabled={!pxLen || !(Number(meters) > 0)} onClick={applyCalibration}>
              보정 적용
            </button>
          </Card>
        )}

        <p className="px-1 text-xs leading-relaxed text-gray-500">
          거리 기준(스프링클러 헤드 수평거리, 소화기·직통계단 보행거리 등)은 축척이 확정된 도면에서만 판정합니다. 미확정 도면은 해당 항목을 &quot;판정 보류&quot;로 표시합니다.
        </p>
      </div>
    </div>
  );
}
