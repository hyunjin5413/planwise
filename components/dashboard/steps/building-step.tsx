"use client";

import { floorLabel } from "@/lib/client/model";
import { BUILDING_USE_LABELS, type BuildingInfo, type BuildingUse, type FloorInfo } from "@/lib/domain/types";
import { getCitation } from "@/lib/engine/legal";
import { evaluateRequirements, FIRE_SYSTEM_LABELS, totalAreaOf } from "@/lib/engine/requirements";
import type { ReviewResult } from "@/lib/engine/review";
import { Card, Chip, Field, inputCls, primaryBtn } from "../ui";
import type { ProjectApi } from "../workspace";

const num = (v: string): number | null => {
  const n = Number(v.replace(/,/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

export function BuildingStep({ api, review }: { api: ProjectApi; review: ReviewResult }) {
  const { project, sheets, updateProject, goTo } = api;
  if (!project) return null;
  const b = project.building;
  const set = (patch: Partial<BuildingInfo>) => updateProject((p) => ({ ...p, building: { ...p.building, ...patch, confirmed: false } }));

  const setFloorCounts = (above: number, below: number) => {
    const floors: FloorInfo[] = [];
    for (let l = -below; l <= above; l++) {
      if (l === 0) continue;
      floors.push(b.floors.find((f) => f.level === l) ?? { level: l, label: floorLabel(l), area: null, windowless: false });
    }
    set({ aboveGroundFloors: above, basementFloors: below, floors });
  };
  const setFloor = (level: number, patch: Partial<FloorInfo>) => set({ floors: b.floors.map((f) => (f.level === level ? { ...f, ...patch } : f)) });

  const reqs = evaluateRequirements(b);
  const sum = totalAreaOf({ ...b, totalArea: null });
  const hints = sheets.filter((s) => s.hints && s.kind === "floor_plan");
  const cite = getCitation("ENF-ATT4", project.standardDate);
  const outOfScope = b.use === "other";

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">건물 정보</h2>
            {b.confirmed ? <Chip tone="green">확인됨</Chip> : <Chip tone="amber">확인 필요</Chip>}
          </div>
          <p className="mt-1 text-sm text-gray-400">이 값으로 설치 의무 시설을 판정합니다. 도면에서 읽은 값을 확인하고 고쳐 주세요.</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="주용도">
              <select className={inputCls} value={b.use} onChange={(e) => set({ use: e.target.value as BuildingUse })}>
                {Object.entries(BUILDING_USE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="세부 용도 (메모)">
              <input className={inputCls} value={b.useDetail} onChange={(e) => set({ useDetail: e.target.value })} placeholder="예: 제2종 근린생활시설 (사무소)" />
            </Field>
            <Field label="지상 층수">
              <input type="number" min={1} className={inputCls} value={b.aboveGroundFloors} onChange={(e) => setFloorCounts(Math.max(1, Number(e.target.value) || 1), b.basementFloors)} />
            </Field>
            <Field label="지하 층수">
              <input type="number" min={0} className={inputCls} value={b.basementFloors} onChange={(e) => setFloorCounts(b.aboveGroundFloors, Math.max(0, Number(e.target.value) || 0))} />
            </Field>
          </div>
          {outOfScope && <p className="mt-3 text-xs text-amber-300">MVP 판정 범위는 근린생활시설과 업무시설입니다. 다른 용도는 설치 대상 판정이 정확하지 않습니다.</p>}

          <div className="mt-5 overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">층</th>
                  <th className="px-3 py-2 text-left font-medium">바닥면적 (㎡)</th>
                  <th className="px-3 py-2 text-left font-medium">무창층</th>
                  <th className="px-3 py-2 text-left font-medium">도면</th>
                </tr>
              </thead>
              <tbody>
                {[...b.floors].reverse().map((f) => {
                  const sheet = sheets.find((s) => s.level === f.level && s.kind === "floor_plan");
                  return (
                    <tr key={f.level} className="border-t border-gray-800">
                      <td className="whitespace-nowrap px-3 py-2 text-gray-200">{f.label}</td>
                      <td className="px-3 py-2">
                        <input
                          className={`${inputCls} h-8`}
                          inputMode="decimal"
                          value={f.area ?? ""}
                          placeholder={sheet?.hints?.floorArea ? String(sheet.hints.floorArea) : "입력"}
                          onChange={(e) => setFloor(f.level, { area: num(e.target.value) })}
                          aria-label={`${f.label} 바닥면적`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-orange-500"
                          checked={f.windowless}
                          onChange={(e) => setFloor(f.level, { windowless: e.target.checked })}
                          aria-label={`${f.label} 무창층`}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{sheet ? "있음" : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="연면적 (㎡)" hint={sum != null ? `비우면 층별 합계 ${sum.toLocaleString("ko-KR")}㎡를 씁니다.` : "층별 바닥면적을 모두 입력하면 합계를 씁니다."}>
              <input className={inputCls} inputMode="decimal" value={b.totalArea ?? ""} placeholder={sum != null ? String(sum) : ""} onChange={(e) => set({ totalArea: num(e.target.value) })} />
            </Field>
            <Field label="수용인원 (선택)" hint="근린생활시설·업무시설은 수용인원 기준 행이 없어 참고용으로만 기록합니다.">
              <input className={inputCls} inputMode="numeric" value={b.occupants ?? ""} onChange={(e) => set({ occupants: num(e.target.value) })} />
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-gray-200">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-orange-500" checked={b.fireResistant} onChange={(e) => set({ fireResistant: e.target.checked })} />
            <span>
              주요구조부가 내화구조
              <span className="block text-xs text-gray-500">스프링클러 헤드 수평거리(2.3m/2.1m)와 직통계단 보행거리(50m/30m) 기준이 달라집니다.</span>
            </span>
          </label>
        </Card>

        {hints.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold">도면에서 읽은 값</h3>
            <ul className="mt-2 space-y-1 text-xs text-gray-400">
              {hints.map((s) => (
                <li key={s.id}>
                  {s.floorLabel}: {[s.hints?.use && `용도 ${s.hints.use}`, s.hints?.floorArea && `바닥면적 ${s.hints.floorArea}㎡`, s.hints?.totalArea && `연면적 ${s.hints.totalArea}㎡`]
                    .filter(Boolean)
                    .join(" · ") || "건물 정보 표기 없음"}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <h2 className="text-base font-semibold">설치 대상 판정</h2>
          <p className="mt-1 text-xs text-gray-500">
            {cite.law} {cite.article} · {cite.checkedVersion} 기준
          </p>
          <ul className="mt-4 divide-y divide-gray-800">
            {reqs.map((r) => (
              <li key={r.system} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-100">{FIRE_SYSTEM_LABELS[r.system]}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{r.reason}</p>
                </div>
                {r.required ? <Chip tone="orange">{r.levels ? "해당 층 대상" : "설치 대상"}</Chip> : <Chip>대상 아님</Chip>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${primaryBtn} mt-5 h-10 w-full`}
            onClick={() => {
              updateProject((p) => ({ ...p, building: { ...p.building, confirmed: true } }));
              goTo("results");
            }}
          >
            {b.confirmed ? "검토 결과 보기" : "이 정보로 확인하고 검토"}
          </button>
          <p className="mt-3 text-[11px] text-gray-500">현재 지적 사항 {review.findings.length}건 · 확인하면 누락 판정이 계산됩니다.</p>
        </Card>
      </div>
    </div>
  );
}
