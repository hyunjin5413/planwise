import type { ObjectKind } from "@/lib/domain/catalog";
import type { BuildingInfo, FloorInfo } from "@/lib/domain/types";
import { REQUIREMENT_THRESHOLDS as T } from "./legal";

/** 시행령 별표 4 판정 단위인 소방시설 */
export type FireSystem =
  | "extinguisher"
  | "indoor_hydrant"
  | "sprinkler"
  | "simple_sprinkler"
  | "fire_detection"
  | "emergency_alarm"
  | "visual_alarm"
  | "guide_lights"
  | "emergency_lighting"
  | "outdoor_hydrant";

export const FIRE_SYSTEM_LABELS: Record<FireSystem, string> = {
  extinguisher: "소화기구",
  indoor_hydrant: "옥내소화전설비",
  sprinkler: "스프링클러설비",
  simple_sprinkler: "간이스프링클러설비",
  fire_detection: "자동화재탐지설비",
  emergency_alarm: "비상경보설비",
  visual_alarm: "시각경보기",
  guide_lights: "유도등",
  emergency_lighting: "비상조명등",
  outdoor_hydrant: "옥외소화전설비",
};

export interface SystemRequirement {
  system: FireSystem;
  required: boolean;
  /** 일부 층만 대상이면 그 층 번호 목록, 모든 층이면 null */
  levels: number[] | null;
  /** 판정 사유 (화면 표시용) */
  reason: string;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function totalAreaOf(b: BuildingInfo): number | null {
  if (b.totalArea != null) return b.totalArea;
  const areas = b.floors.map((f) => f.area);
  if (areas.length === 0 || areas.some((a) => a == null)) return null;
  return areas.reduce<number>((s, a) => s + (a ?? 0), 0);
}

function isRiskFloor(f: FloorInfo, minLevel: number): boolean {
  return f.level < 0 || f.windowless || f.level >= minLevel;
}

/**
 * 확인된 건물 정보로 설치 의무 시설을 판정한다.
 * MVP 범위(근린생활시설·업무시설)의 일반 조건만 다루며, 세부 용도별 특례
 * (조산원·산후조리원, 목욕장 등)는 "확인 필요"로 넘긴다.
 */
export function evaluateRequirements(b: BuildingInfo): SystemRequirement[] {
  const total = totalAreaOf(b);
  const totalKnown = total != null;
  const totalText = totalKnown ? `연면적 ${fmt(total)}㎡` : "연면적 미입력";
  const out: SystemRequirement[] = [];

  // 소화기구: 연면적 33㎡ 이상
  out.push({
    system: "extinguisher",
    required: !totalKnown || total >= T.extinguisherTotalAreaM2,
    levels: null,
    reason: `${totalText} (기준 ${T.extinguisherTotalAreaM2}㎡ 이상)`,
  });

  // 옥내소화전: 근린생활시설·업무시설 연면적 1,500㎡ 이상, 또는 지하층·무창층·4층 이상 층 중 바닥면적 300㎡ 이상인 층이 있으면 모든 층
  const hydrantFloor = b.floors.find((f) => isRiskFloor(f, 4) && (f.area ?? 0) >= T.hydrantFloorAreaM2);
  const hydrant = (totalKnown && total >= T.hydrantTotalAreaM2) || !!hydrantFloor;
  out.push({
    system: "indoor_hydrant",
    required: hydrant,
    levels: null,
    reason: hydrantFloor
      ? `${hydrantFloor.label} 바닥면적 ${fmt(hydrantFloor.area ?? 0)}㎡ (지하층·무창층·4층 이상 층 ${T.hydrantFloorAreaM2}㎡ 이상)`
      : `${totalText} (기준 ${fmt(T.hydrantTotalAreaM2)}㎡ 이상)`,
  });

  // 스프링클러: 층수 6층 이상이면 모든 층. 지하층·무창층·4층 이상 층으로서 바닥면적 1,000㎡ 이상이면 해당 층
  const spAll = b.aboveGroundFloors >= T.sprinklerMinFloors;
  const spFloors = b.floors.filter((f) => isRiskFloor(f, 4) && (f.area ?? 0) >= T.sprinklerFloorAreaM2);
  out.push({
    system: "sprinkler",
    required: spAll || spFloors.length > 0,
    levels: spAll ? null : spFloors.map((f) => f.level),
    reason: spAll
      ? `지상 ${b.aboveGroundFloors}층 (${T.sprinklerMinFloors}층 이상은 모든 층)`
      : spFloors.length > 0
        ? `${spFloors.map((f) => f.label).join(", ")} 바닥면적 ${fmt(T.sprinklerFloorAreaM2)}㎡ 이상 (해당 층)`
        : `지상 ${b.aboveGroundFloors}층, 바닥면적 ${fmt(T.sprinklerFloorAreaM2)}㎡ 이상인 지하층·무창층·4층 이상 층 없음`,
  });
  const sprinklerAll = spAll;

  // 간이스프링클러: 근린생활시설 바닥면적 합계 1,000㎡ 이상이면 모든 층 (스프링클러 대상이 아닌 경우)
  const simpleSp =
    b.use === "neighborhood" && !sprinklerAll && totalKnown && total >= T.simpleSprinklerNeighborhoodAreaM2;
  out.push({
    system: "simple_sprinkler",
    required: simpleSp,
    levels: null,
    reason:
      b.use === "neighborhood"
        ? `근린생활시설 ${totalText} (기준 ${fmt(T.simpleSprinklerNeighborhoodAreaM2)}㎡ 이상)`
        : "근린생활시설이 아님",
  });

  // 자동화재탐지설비: 근린생활시설 600㎡, 업무시설 1,000㎡ 이상, 또는 층수 6층 이상이면 모든 층
  const fdArea =
    b.use === "neighborhood" ? T.fireDetectionNeighborhoodAreaM2 : b.use === "office" ? T.fireDetectionOfficeAreaM2 : null;
  const fd =
    b.aboveGroundFloors >= T.fireDetectionMinFloors || (fdArea != null && totalKnown && total >= fdArea);
  out.push({
    system: "fire_detection",
    required: fd,
    levels: null,
    reason:
      b.aboveGroundFloors >= T.fireDetectionMinFloors
        ? `지상 ${b.aboveGroundFloors}층 (${T.fireDetectionMinFloors}층 이상은 모든 층)`
        : fdArea != null
          ? `${totalText} (기준 ${fmt(fdArea)}㎡ 이상)`
          : "MVP 판정 범위 밖 용도",
  });

  // 비상경보설비: 연면적 400㎡ 이상 또는 지하층·무창층 바닥면적 150㎡ 이상 (자동화재탐지설비 대상이면 그것으로 갈음)
  const eaFloor = b.floors.find((f) => (f.level < 0 || f.windowless) && (f.area ?? 0) >= T.emergencyAlarmBasementAreaM2);
  const ea = !fd && ((totalKnown && total >= T.emergencyAlarmTotalAreaM2) || !!eaFloor);
  out.push({
    system: "emergency_alarm",
    required: ea,
    levels: null,
    reason: fd
      ? "자동화재탐지설비 설치 대상이므로 별도 판정하지 않음"
      : eaFloor
        ? `${eaFloor.label} 바닥면적 ${fmt(eaFloor.area ?? 0)}㎡ (지하층·무창층 ${T.emergencyAlarmBasementAreaM2}㎡ 이상)`
        : `${totalText} (기준 ${T.emergencyAlarmTotalAreaM2}㎡ 이상)`,
  });

  // 시각경보기: 자동화재탐지설비 대상 중 근린생활시설·업무시설
  out.push({
    system: "visual_alarm",
    required: fd && (b.use === "neighborhood" || b.use === "office"),
    levels: null,
    reason: fd ? "자동화재탐지설비 설치 대상인 근린생활시설·업무시설" : "자동화재탐지설비 설치 대상 아님",
  });

  // 유도등: 모든 특정소방대상물
  out.push({ system: "guide_lights", required: true, levels: null, reason: "모든 특정소방대상물" });

  // 비상조명등: 지하층 포함 5층 이상 + 연면적 3,000㎡ 이상이면 모든 층, 지하층·무창층 바닥면적 450㎡ 이상이면 그 층
  const allFloors = b.aboveGroundFloors + b.basementFloors;
  const elAll = allFloors >= T.emergencyLightMinFloors && totalKnown && total >= T.emergencyLightTotalAreaM2;
  const elFloors = b.floors.filter((f) => (f.level < 0 || f.windowless) && (f.area ?? 0) >= T.emergencyLightBasementAreaM2);
  out.push({
    system: "emergency_lighting",
    required: elAll || elFloors.length > 0,
    levels: elAll ? null : elFloors.map((f) => f.level),
    reason: elAll
      ? `지하층 포함 ${allFloors}층, ${totalText}`
      : elFloors.length > 0
        ? `${elFloors.map((f) => f.label).join(", ")} 바닥면적 ${T.emergencyLightBasementAreaM2}㎡ 이상 (해당 층)`
        : `지하층 포함 ${allFloors}층, ${totalText} (기준 ${T.emergencyLightMinFloors}층 이상·${fmt(T.emergencyLightTotalAreaM2)}㎡ 이상)`,
  });

  // 옥외소화전: 지상 1층 및 2층 바닥면적 합계 9,000㎡ 이상
  const g12 = b.floors.filter((f) => f.level === 1 || f.level === 2).reduce((s, f) => s + (f.area ?? 0), 0);
  out.push({
    system: "outdoor_hydrant",
    required: g12 >= T.outdoorHydrantGround12AreaM2,
    levels: null,
    reason: `지상 1·2층 바닥면적 합계 ${fmt(g12)}㎡ (기준 ${fmt(T.outdoorHydrantGround12AreaM2)}㎡ 이상)`,
  });

  return out;
}

export function systemAppliesTo(req: SystemRequirement, level: number | null): boolean {
  if (!req.required) return false;
  if (req.levels === null) return true;
  return level != null && req.levels.includes(level);
}

export interface KindRequirement {
  kind: ObjectKind;
  /** true: 설치 의무, false: 의무 아님, null: 판정 보류 */
  required: boolean | null;
  /** floor: 층마다 있어야 함, building: 건물에 하나 이상 */
  scope: "floor" | "building";
  systems: FireSystem[];
  reason: string;
  /** 도면(평면도)으로 확인할 수 없는 시설 (예: 옥외소화전은 배치도) */
  notOnFloorPlan?: boolean;
}

/**
 * 설치 의무 시설을 객체 종류로 펼친다.
 * reqs가 null이면 (건물 정보 미확인) 모든 의무 여부를 판정 보류로 둔다.
 */
export function kindRequirementsForFloor(
  reqs: SystemRequirement[] | null,
  level: number | null,
  ctx: { hasCorridor: boolean; hasStairOrCorridor: boolean; heatDetectorCount: number },
): Map<ObjectKind, KindRequirement> {
  const m = new Map<ObjectKind, KindRequirement>();
  const get = (s: FireSystem) => reqs?.find((r) => r.system === s);
  const applies = (s: FireSystem) => {
    const r = get(s);
    return r ? systemAppliesTo(r, level) : false;
  };
  const put = (kind: ObjectKind, systems: FireSystem[], required: boolean, reason: string, extra?: Partial<KindRequirement>) => {
    m.set(kind, {
      kind,
      required: reqs ? required : null,
      scope: "floor",
      systems,
      reason: reqs ? reason : "건물 정보 확인 전",
      ...extra,
    });
  };
  const label = (s: FireSystem) => FIRE_SYSTEM_LABELS[s];

  put("extinguisher", ["extinguisher"], applies("extinguisher"), `${label("extinguisher")} 설치 대상`);
  put("indoor_hydrant", ["indoor_hydrant"], applies("indoor_hydrant"), `${label("indoor_hydrant")} 설치 대상`);
  const sp = applies("sprinkler") || applies("simple_sprinkler");
  put("sprinkler_head", ["sprinkler", "simple_sprinkler"], sp, applies("sprinkler") ? "스프링클러설비 설치 대상 층" : "간이스프링클러설비 설치 대상");
  const fd = applies("fire_detection");
  const ea = applies("emergency_alarm");
  // 연기감지기: 계단·복도가 있는 층은 연기감지기가 필요하고, 없으면 열감지기로 대체 가능
  const smokeNeeded = fd && (ctx.hasStairOrCorridor || ctx.heatDetectorCount === 0);
  put("smoke_detector", ["fire_detection"], smokeNeeded, ctx.hasStairOrCorridor ? "자동화재탐지설비 대상, 계단·복도는 연기감지기 설치 장소" : "자동화재탐지설비 대상");
  put("heat_detector", ["fire_detection"], false, fd ? "연기감지기로 대체 가능 (설치 의무 시설 아님)" : "자동화재탐지설비 대상 아님");
  put("manual_call_point", ["fire_detection", "emergency_alarm"], fd || ea, fd ? "자동화재탐지설비 대상" : "비상경보설비 대상");
  put("alarm_bell", ["fire_detection", "emergency_alarm"], fd || ea, fd ? "자동화재탐지설비 대상" : "비상경보설비 대상");
  put("fire_receiver", ["fire_detection"], fd, "자동화재탐지설비 대상", { scope: "building" });
  put("visual_alarm", ["visual_alarm"], applies("visual_alarm"), "시각경보기 설치 대상");
  put("exit_sign", ["guide_lights"], applies("guide_lights"), "모든 특정소방대상물");
  put("corridor_guide_light", ["guide_lights"], applies("guide_lights") && ctx.hasCorridor, ctx.hasCorridor ? "복도가 있는 층" : "도면에서 복도를 찾지 못함");
  put("emergency_light", ["emergency_lighting"], applies("emergency_lighting"), "비상조명등 설치 대상 층");
  put("outdoor_hydrant", ["outdoor_hydrant"], applies("outdoor_hydrant"), "옥외소화전설비 설치 대상", {
    scope: "building",
    notOnFloorPlan: true,
  });
  return m;
}
