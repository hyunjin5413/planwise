/**
 * 인식 대상 객체 카탈로그.
 * 색상은 종류별로 고정하고, 색각 이상 사용자를 위해 약어를 함께 쓴다 (PRD: 접근성).
 * 박스는 흰 바탕 도면 위에 그려지므로 채도가 있는 중간 명도 색을 쓴다.
 */

export const OBJECT_KINDS = [
  // 소화설비
  "extinguisher",
  "indoor_hydrant",
  "sprinkler_head",
  "outdoor_hydrant",
  // 경보설비
  "smoke_detector",
  "heat_detector",
  "manual_call_point",
  "alarm_bell",
  "visual_alarm",
  "fire_receiver",
  // 피난구조설비
  "exit_sign",
  "corridor_guide_light",
  "emergency_light",
  // 건축 요소
  "room",
  "door",
  "stair",
  "window",
] as const;

export type ObjectKind = (typeof OBJECT_KINDS)[number];

export type ObjectCategory = "extinguishing" | "alarm" | "evacuation" | "architecture";

export interface ObjectKindInfo {
  kind: ObjectKind;
  label: string;
  abbr: string;
  color: string;
  category: ObjectCategory;
  /** P0: MVP 인식 대상, P1: 파일럿 중 추가 */
  priority: "P0" | "P1";
  /** 집계 패널에 소방시설로 표시하는지 (건축 요소는 제외) */
  facility: boolean;
}

export const CATEGORY_LABELS: Record<ObjectCategory, string> = {
  extinguishing: "소화설비",
  alarm: "경보설비",
  evacuation: "피난구조설비",
  architecture: "건축 요소",
};

export const OBJECT_CATALOG: Record<ObjectKind, ObjectKindInfo> = {
  extinguisher: { kind: "extinguisher", label: "소화기", abbr: "소", color: "#dc2626", category: "extinguishing", priority: "P0", facility: true },
  indoor_hydrant: { kind: "indoor_hydrant", label: "옥내소화전", abbr: "옥", color: "#e11d48", category: "extinguishing", priority: "P0", facility: true },
  sprinkler_head: { kind: "sprinkler_head", label: "스프링클러 헤드", abbr: "SP", color: "#2563eb", category: "extinguishing", priority: "P0", facility: true },
  outdoor_hydrant: { kind: "outdoor_hydrant", label: "옥외소화전", abbr: "옥외", color: "#be123c", category: "extinguishing", priority: "P1", facility: true },
  smoke_detector: { kind: "smoke_detector", label: "연기감지기", abbr: "연", color: "#7c3aed", category: "alarm", priority: "P0", facility: true },
  heat_detector: { kind: "heat_detector", label: "열감지기", abbr: "열", color: "#c026d3", category: "alarm", priority: "P0", facility: true },
  manual_call_point: { kind: "manual_call_point", label: "발신기", abbr: "발", color: "#ea580c", category: "alarm", priority: "P0", facility: true },
  alarm_bell: { kind: "alarm_bell", label: "경종", abbr: "경", color: "#ca8a04", category: "alarm", priority: "P0", facility: true },
  visual_alarm: { kind: "visual_alarm", label: "시각경보기", abbr: "시", color: "#0891b2", category: "alarm", priority: "P0", facility: true },
  fire_receiver: { kind: "fire_receiver", label: "수신기", abbr: "수", color: "#4f46e5", category: "alarm", priority: "P0", facility: true },
  exit_sign: { kind: "exit_sign", label: "피난구유도등", abbr: "피", color: "#16a34a", category: "evacuation", priority: "P0", facility: true },
  corridor_guide_light: { kind: "corridor_guide_light", label: "통로유도등", abbr: "통", color: "#65a30d", category: "evacuation", priority: "P0", facility: true },
  emergency_light: { kind: "emergency_light", label: "비상조명등", abbr: "비", color: "#0d9488", category: "evacuation", priority: "P0", facility: true },
  room: { kind: "room", label: "실", abbr: "실", color: "#64748b", category: "architecture", priority: "P0", facility: false },
  door: { kind: "door", label: "출입문", abbr: "문", color: "#92400e", category: "architecture", priority: "P0", facility: false },
  stair: { kind: "stair", label: "계단", abbr: "계", color: "#475569", category: "architecture", priority: "P0", facility: false },
  window: { kind: "window", label: "창호", abbr: "창", color: "#94a3b8", category: "architecture", priority: "P0", facility: false },
};

export const FACILITY_KINDS = OBJECT_KINDS.filter((k) => OBJECT_CATALOG[k].facility);
export const ARCHITECTURE_KINDS = OBJECT_KINDS.filter((k) => !OBJECT_CATALOG[k].facility);

export function kindInfo(kind: ObjectKind): ObjectKindInfo {
  return OBJECT_CATALOG[kind];
}

/** 실 명칭 → 실 용도. 판정에서 거실 여부, 설치 제외 장소 후보를 가르는 데 쓴다. */
export type RoomUse =
  | "habitable" // 거실 (사무실, 회의실, 점포 등)
  | "corridor"
  | "stair"
  | "toilet"
  | "elevator"
  | "shaft" // EPS, TPS, PS, 덕트
  | "mechanical" // 기계실, 전기실
  | "storage"
  | "other";

const ROOM_USE_PATTERNS: [RegExp, RoomUse][] = [
  [/계단|stair/i, "stair"],
  [/복도|통로|홀|로비|corridor|hall|lobby/i, "corridor"],
  [/화장실|욕실|샤워|wc|toilet|restroom/i, "toilet"],
  [/엘리베이터|승강|ev\b|elev/i, "elevator"],
  [/eps|tps|\bps\b|pit|피트|덕트|duct|샤프트/i, "shaft"],
  [/기계실|전기실|발전기|펌프실|보일러/i, "mechanical"],
  [/창고|수납|storage/i, "storage"],
];

export function roomUseFromName(name: string | undefined): RoomUse {
  if (!name) return "habitable";
  for (const [re, use] of ROOM_USE_PATTERNS) if (re.test(name)) return use;
  return "habitable";
}

export const ROOM_USE_LABELS: Record<RoomUse, string> = {
  habitable: "거실",
  corridor: "복도·통로",
  stair: "계단실",
  toilet: "화장실",
  elevator: "승강기",
  shaft: "샤프트",
  mechanical: "기계·전기실",
  storage: "창고",
  other: "기타",
};
