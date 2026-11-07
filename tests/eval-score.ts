/** 인식 평가 공통: 정답 로드, 정답-인식 매칭, PRD 성공 지표 계산 */
import fs from "node:fs";
import path from "node:path";
import type { AnalyzeOutput } from "@/lib/ai/analyze";
import { OBJECT_CATALOG, type ObjectKind } from "@/lib/domain/catalog";
import type { BuildingInfo, Detection, Sheet } from "@/lib/domain/types";
import { center, dist, iou } from "@/lib/engine/geometry";
import { reviewProject } from "@/lib/engine/review";
import { project } from "./helpers";

export interface Truth {
  id: string;
  floorLabel: string;
  level: number;
  width: number;
  height: number;
  pxPerMeter: number;
  building: Omit<BuildingInfo, "confirmed">;
  expectedFindings: { ruleId: string; room?: string; kind?: string; type: string }[];
  objects: { id: string; kind: ObjectKind; box: Detection["box"]; label?: string }[];
}

export const EVAL_SAMPLES = (process.env.PLANWISE_EVAL_SAMPLES ?? "seongsu-3f,seongsu-1f").split(",");

export const loadTruth = (id: string): Truth =>
  JSON.parse(fs.readFileSync(path.resolve("public/samples", `${id}.truth.json`), "utf8"));
export const loadSampleImage = (id: string) => fs.readFileSync(path.resolve("public/samples", `${id}.png`));

const P0_SYMBOLS = (Object.values(OBJECT_CATALOG) as { kind: ObjectKind; facility: boolean; priority: string }[])
  .filter((k) => k.facility && k.priority === "P0")
  .map((k) => k.kind);

/** 같은 종류끼리 가까운 순서로 1:1 매칭. 실은 IoU 0.5 이상 */
function match(truth: Truth["objects"], dets: Detection[], ppm: number) {
  const pairs: { t: number; d: number; score: number }[] = [];
  truth.forEach((t, ti) =>
    dets.forEach((d, di) => {
      if (t.kind === "room" || d.kind === "room") {
        if (t.kind === d.kind && iou(t.box, d.box) >= 0.5) pairs.push({ t: ti, d: di, score: -iou(t.box, d.box) });
        return;
      }
      const tol = Math.max(0.35 * ppm, 0.6 * Math.max(t.box.w, t.box.h));
      const dd = dist(center(t.box), center(d.box));
      if (dd <= tol) pairs.push({ t: ti, d: di, score: dd + (t.kind === d.kind ? 0 : 1e6) });
    }),
  );
  pairs.sort((a, b) => a.score - b.score);
  const usedT = new Set<number>();
  const usedD = new Set<number>();
  const matched: { t: number; d: number; sameKind: boolean }[] = [];
  for (const p of pairs) {
    if (usedT.has(p.t) || usedD.has(p.d)) continue;
    usedT.add(p.t);
    usedD.add(p.d);
    matched.push({ t: p.t, d: p.d, sameKind: truth[p.t].kind === dets[p.d].kind });
  }
  return matched;
}

/** 시트 한 장의 인식 결과를 정답과 비교하고, 규칙 엔진에 넣을 시트를 만든다 */
export function scoreSheet(id: string, out: AnalyzeOutput, seconds: number) {
  const truth = loadTruth(id);
  const ppm = truth.pxPerMeter;
  const m = match(truth.objects, out.detections, ppm);
  const perKind: Record<string, { truth: number; detected: number; tp: number }> = {};
  for (const o of truth.objects) (perKind[o.kind] ??= { truth: 0, detected: 0, tp: 0 }).truth++;
  for (const d of out.detections) (perKind[d.kind] ??= { truth: 0, detected: 0, tp: 0 }).detected++;
  for (const x of m) if (x.sameKind) perKind[truth.objects[x.t].kind].tp++;

  const p0Truth = truth.objects.filter((o) => P0_SYMBOLS.includes(o.kind));
  const p0Found = m.filter((x) => P0_SYMBOLS.includes(truth.objects[x.t].kind)).length; // 박스로 찾음 (종류 무관)
  const facilityDets = out.detections.filter((d) => OBJECT_CATALOG[d.kind].facility);
  const facilityCorrect = m.filter((x) => x.sameKind && OBJECT_CATALOG[out.detections[x.d].kind].facility).length;
  const countsExact = P0_SYMBOLS.every((k) => (perKind[k]?.truth ?? 0) === (perKind[k]?.detected ?? 0));
  const scaleErr = out.scale.pxPerMeter ? Math.abs(out.scale.pxPerMeter - ppm) / ppm : null;

  const result = {
    id,
    seconds,
    tiles: out.tiles,
    usage: out.usage,
    sheet: out.sheet,
    sheetCorrect: out.sheet.kind === "floor_plan" && out.sheet.level === truth.level,
    scale: {
      estimated: out.scale.pxPerMeter,
      truth: ppm,
      errorPct: scaleErr != null ? +(scaleErr * 100).toFixed(2) : null,
      needsCalibration: out.scale.needsCalibration,
    },
    recallP0: +(p0Found / p0Truth.length).toFixed(3),
    precision: facilityDets.length ? +(facilityCorrect / facilityDets.length).toFixed(3) : 0,
    countsExact,
    perKind,
    quality: out.quality.issues,
  };

  // 판정은 축척을 정답값으로 확정한 상태에서 본다 (축척 오차와 인식 오차를 분리)
  const sheet: Sheet = {
    id,
    projectId: "eval",
    name: id,
    kind: "floor_plan",
    floorLabel: truth.floorLabel,
    level: truth.level,
    imageKey: id,
    width: truth.width,
    height: truth.height,
    createdAt: new Date().toISOString(),
    scale: { pxPerMeter: ppm, confirmed: true, method: "sample", estimates: [] },
    quality: out.quality,
    analysis: { status: "done", source: "ai" },
    detections: out.detections,
  };
  return { result, sheet, building: { ...truth.building, confirmed: true } as BuildingInfo };
}

/** 여러 시트를 묶어 지적 사항 재현율까지 계산하고 eval-results/에 저장한다 */
export function summarize(model: string, scored: ReturnType<typeof scoreSheet>[], filePrefix = "") {
  const review = reviewProject(project({ building: scored[scored.length - 1].building }), scored.map((s) => s.sheet));
  const expected = scored.flatMap((s) => loadTruth(s.result.id).expectedFindings.map((e) => ({ ...e, sheet: s.result.id })));
  const hits = (f: (typeof review.findings)[number], e: (typeof expected)[number]) =>
    f.ruleId === e.ruleId &&
    f.sheetId === e.sheet &&
    (e.room ? f.roomName === e.room : true) &&
    (e.kind ? f.targetKinds.includes(e.kind as ObjectKind) : true);
  const hit = expected.filter((e) => review.findings.some((f) => hits(f, e)));
  const summary = {
    model,
    at: new Date().toISOString(),
    samples: scored.map((s) => s.result),
    findingRecall: +(hit.length / expected.length).toFixed(3),
    missedFindings: expected.filter((e) => !hit.includes(e)),
    unexpectedFindings: review.findings
      .filter((f) => f.sheetId && !expected.some((e) => hits(f, e)))
      .map((f) => ({ ruleId: f.ruleId, type: f.type, sheet: f.sheetId, room: f.roomName, title: f.title })),
    targets: { recallP0: 0.9, precision: 0.85, countsExact: 0.8, findingRecall: 0.85, seconds: 120 },
  };
  fs.mkdirSync("eval-results", { recursive: true });
  const file = path.join("eval-results", `${filePrefix}${summary.at.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2));
  return { file, summary };
}
