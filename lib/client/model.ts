import type { AnalyzeOutput } from "@/lib/ai/analyze";
import type { BuildingInfo, BuildingUse, FloorInfo, Project, Sheet } from "@/lib/domain/types";
import { area } from "@/lib/engine/geometry";

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyBuilding(): BuildingInfo {
  return {
    use: "neighborhood",
    useDetail: "",
    aboveGroundFloors: 1,
    basementFloors: 0,
    floors: [{ level: 1, label: "1층", area: null, windowless: false }],
    totalArea: null,
    fireResistant: true,
    occupants: null,
    confirmed: false,
  };
}

export function newProject(id: string, name: string, address: string, standardDate: string): Project {
  const now = new Date().toISOString();
  return { id, name, address, standardDate, createdAt: now, updatedAt: now, building: emptyBuilding(), findingActions: {}, guideTexts: {} };
}

/** "3층", "3F", "B1", "지하1층" → 층 번호 */
export function parseFloor(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/\s/g, "");
  let m = t.match(/(?:지하|B)(\d+)(?:층|F)?/i);
  if (m) return -Number(m[1]);
  m = t.match(/(\d+)(?:층|F)/i);
  if (m) return Number(m[1]);
  return null;
}

export function floorLabel(level: number | null): string {
  if (level == null) return "층 미지정";
  return level < 0 ? `지하${-level}층` : `${level}층`;
}

export function newSheet(opts: {
  id: string;
  projectId: string;
  name: string;
  imageKey: string;
  width: number;
  height: number;
  dpi: number | null;
}): Sheet {
  const level = parseFloor(opts.name);
  const issues: Sheet["quality"]["issues"] = [];
  if (Math.max(opts.width, opts.height) < 2000) {
    issues.push({ code: "low_resolution", severity: "warn", message: `긴 변이 ${Math.max(opts.width, opts.height)}px로 작습니다. 작은 심볼을 놓칠 수 있습니다.` });
  }
  if (opts.dpi != null && opts.dpi < 150) {
    issues.push({ code: "very_low_resolution", severity: "error", message: `해상도가 ${Math.round(opts.dpi)}dpi로 150dpi 미만입니다. 거리 판정을 보류하고 재업로드를 권장합니다.` });
  }
  return {
    id: opts.id,
    projectId: opts.projectId,
    name: opts.name,
    kind: "floor_plan",
    floorLabel: floorLabel(level),
    level,
    imageKey: opts.imageKey,
    width: opts.width,
    height: opts.height,
    createdAt: new Date().toISOString(),
    scale: { pxPerMeter: null, confirmed: false, method: null, ratioText: null, estimates: [] },
    quality: { width: opts.width, height: opts.height, dpi: opts.dpi, sharpness: null, issues },
    analysis: { status: "idle" },
    detections: [],
  };
}

/** AI 분석 결과를 시트에 반영한다. 사용자가 확정한 축척은 덮어쓰지 않는다 */
export function applyAnalysis(sheet: Sheet, out: AnalyzeOutput, startedAt: string): Sheet {
  const level = out.sheet.level ?? parseFloor(out.sheet.floorLabel) ?? sheet.level;
  const keepScale = sheet.scale.confirmed;
  const issues = [...out.quality.issues];
  return {
    ...sheet,
    kind: out.sheet.kind,
    level,
    floorLabel: out.sheet.floorLabel ?? floorLabel(level),
    scale: keepScale
      ? { ...sheet.scale, estimates: out.scale.estimates, ratioText: out.scale.ratioText }
      : {
          pxPerMeter: out.scale.pxPerMeter,
          confirmed: false,
          method: out.scale.estimates[0]?.method ?? null,
          ratioText: out.scale.ratioText,
          estimates: out.scale.estimates,
          needsCalibration: out.scale.needsCalibration,
          note: out.scale.note,
          calibration: null,
        },
    quality: { ...out.quality, issues },
    legendBox: out.legendBox,
    detections: out.detections,
    hints: out.hints,
    analysis: {
      status: "done",
      source: "ai",
      model: out.model,
      modelVersion: out.model,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: out.durationMs,
      usage: out.usage,
    },
  };
}

export const USE_FROM_TEXT: [RegExp, BuildingUse][] = [
  [/근린|근생|점포|상가/, "neighborhood"],
  [/업무|사무|오피스/, "office"],
];

/**
 * 시트와 AI 단서로 건물 정보 초안을 채운다. 사용자가 확인한 값은 바꾸지 않는다.
 */
export function draftBuilding(b: BuildingInfo, sheets: Sheet[]): BuildingInfo {
  if (b.confirmed) return b;
  const plans = sheets.filter((s) => s.kind === "floor_plan");
  const hints = plans.map((s) => s.hints).filter(Boolean);
  const useText = hints.map((h) => h?.use ?? "").join(" ");
  const use = USE_FROM_TEXT.find(([re]) => re.test(useText))?.[1] ?? b.use;
  const levels = new Set<number>(b.floors.map((f) => f.level));
  for (const s of plans) if (s.level != null) levels.add(s.level);
  const maxAbove = Math.max(b.aboveGroundFloors, ...[...levels].filter((l) => l > 0), ...hints.map((h) => h?.aboveGroundFloors ?? 0));
  const maxBelow = Math.max(b.basementFloors, ...[...levels].filter((l) => l < 0).map((l) => -l), ...hints.map((h) => h?.basementFloors ?? 0));
  const floors: FloorInfo[] = [];
  for (let l = -maxBelow; l <= maxAbove; l++) {
    if (l === 0) continue;
    const prev = b.floors.find((f) => f.level === l);
    const sheet = plans.find((s) => s.level === l);
    floors.push({
      level: l,
      label: floorLabel(l),
      area: prev?.area ?? sheet?.hints?.floorArea ?? estimateFloorArea(sheet) ?? null,
      windowless: prev?.windowless ?? false,
    });
  }
  const totalHint = hints.find((h) => h?.totalArea)?.totalArea ?? null;
  return { ...b, use, aboveGroundFloors: maxAbove, basementFloors: maxBelow, floors, totalArea: b.totalArea ?? totalHint };
}

/** 축척이 있으면 실 박스 외곽으로 바닥면적을 대략 추정한다 */
export function estimateFloorArea(sheet: Sheet | undefined): number | null {
  if (!sheet?.scale.pxPerMeter) return null;
  const rooms = sheet.detections.filter((d) => d.kind === "room");
  if (rooms.length === 0) return null;
  const xs = rooms.flatMap((r) => [r.box.x, r.box.x + r.box.w]);
  const ys = rooms.flatMap((r) => [r.box.y, r.box.y + r.box.h]);
  const env = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return Math.round(area(env) / sheet.scale.pxPerMeter ** 2);
}
