import type { ObjectKind, RoomUse } from "./catalog";

/** 도면 이미지 픽셀 좌표계의 사각형 (원본 해상도 기준) */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type DetectionSource = "ai" | "user" | "sample";

export interface Detection {
  id: string;
  kind: ObjectKind;
  box: Box;
  /** 0~1. 임계값 미만은 점선 박스와 "확인 필요"로 표시 */
  confidence: number;
  source: DetectionSource;
  /** 실 명칭 (kind === "room") */
  label?: string;
  /** 실 용도. 없으면 label에서 추정 */
  roomUse?: RoomUse;
}

export type SheetKind = "floor_plan" | "section" | "system_diagram" | "legend" | "other";

export const SHEET_KIND_LABELS: Record<SheetKind, string> = {
  floor_plan: "평면도",
  section: "단면도",
  system_diagram: "계통도",
  legend: "범례",
  other: "기타",
};

export type ScaleMethod = "title_block" | "dimension" | "calibration" | "pdf" | "sample";

export interface ScaleEstimate {
  method: ScaleMethod;
  pxPerMeter: number;
  note?: string;
}

export interface ScaleInfo {
  /** 1m가 도면 이미지에서 몇 픽셀인지. 확정 전에는 추정값 */
  pxPerMeter: number | null;
  /** 사람이 확인했는지. 거리 판정은 confirmed일 때만 실행 */
  confirmed: boolean;
  method: ScaleMethod | null;
  /** 표제란 축척 표기 (예: "1:100") */
  ratioText?: string | null;
  estimates: ScaleEstimate[];
  calibration?: { p1: Point; p2: Point; meters: number } | null;
  /** 추정값끼리 10% 넘게 어긋나는 등 사람 보정이 필요한지 */
  needsCalibration?: boolean;
  /** 추정 근거 설명 */
  note?: string;
}

export type QualitySeverity = "info" | "warn" | "error";

export interface QualityIssue {
  code: "low_resolution" | "very_low_resolution" | "blurry" | "skewed" | "cropped" | "large_image";
  severity: QualitySeverity;
  message: string;
}

export interface SheetQuality {
  width: number;
  height: number;
  /** 추정 dpi. 알 수 없으면 null */
  dpi: number | null;
  /** 라플라시안 분산 기반 선명도. 낮을수록 흐림 */
  sharpness: number | null;
  issues: QualityIssue[];
}

export type AnalysisStatus = "idle" | "running" | "done" | "error";

export interface SheetAnalysis {
  status: AnalysisStatus;
  error?: string;
  model?: string;
  source?: "ai" | "sample" | "manual";
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  /** 결과 재현성을 위한 기록 (PRD: 모델 버전 기록) */
  modelVersion?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** AI가 도면에서 읽은 건물 정보 단서 (사용자 확인 전) */
export interface BuildingHints {
  use?: string | null;
  floorLabel?: string | null;
  floorArea?: number | null;
  totalArea?: number | null;
  aboveGroundFloors?: number | null;
  basementFloors?: number | null;
  fireResistant?: boolean | null;
  notes?: string[];
}

export interface Sheet {
  id: string;
  projectId: string;
  /** 파일명 (PDF는 "파일명 p.3") */
  name: string;
  kind: SheetKind;
  /** 표시용 층 이름 (예: "3층", "지하1층") */
  floorLabel: string;
  /** 층 번호. 지하는 음수. 모르면 null */
  level: number | null;
  /** IndexedDB에 저장된 이미지 blob 키 */
  imageKey: string;
  width: number;
  height: number;
  createdAt: string;
  scale: ScaleInfo;
  quality: SheetQuality;
  analysis: SheetAnalysis;
  detections: Detection[];
  hints?: BuildingHints;
  /** 범례 영역 (있으면) */
  legendBox?: Box | null;
}

export type BuildingUse = "neighborhood" | "office" | "other";

export const BUILDING_USE_LABELS: Record<BuildingUse, string> = {
  neighborhood: "근린생활시설",
  office: "업무시설",
  other: "기타 (MVP 판정 범위 밖)",
};

export interface FloorInfo {
  level: number;
  label: string;
  /** 바닥면적 ㎡ */
  area: number | null;
  /** 무창층 여부 */
  windowless: boolean;
}

export interface BuildingInfo {
  use: BuildingUse;
  /** 세부 용도 메모 (예: 제2종 근린생활시설 사무소) */
  useDetail: string;
  aboveGroundFloors: number;
  basementFloors: number;
  floors: FloorInfo[];
  /** 연면적 ㎡. 비우면 층별 바닥면적 합계 */
  totalArea: number | null;
  /** 주요구조부 내화구조 여부 */
  fireResistant: boolean;
  /** 수용인원 */
  occupants: number | null;
  /** 사용자가 확인했는지. 미확인이면 설치 대상 판정은 "판정 보류" */
  confirmed: boolean;
}

export type FindingType = "violation" | "missing" | "check" | "pending";

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  violation: "위반 의심",
  missing: "누락 의심",
  check: "확인 필요",
  pending: "판정 보류",
};

export const FINDING_TYPE_ORDER: FindingType[] = ["violation", "missing", "check", "pending"];

export type FindingActionStatus = "open" | "confirmed" | "hold" | "disputed";

export const FINDING_ACTION_LABELS: Record<FindingActionStatus, string> = {
  open: "미처리",
  confirmed: "확인",
  hold: "보류",
  disputed: "이의 제기",
};

export interface FindingAction {
  status: FindingActionStatus;
  memo: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  address: string;
  /** 적용 기준일 (YYYY-MM-DD). 이 날짜에 시행 중인 기준으로 검토 */
  standardDate: string;
  createdAt: string;
  updatedAt: string;
  building: BuildingInfo;
  /** 지적 사항별 사용자 조치. key는 Finding.key */
  findingActions: Record<string, FindingAction>;
  /** AI로 다듬은 가이드 문장. key는 Finding.key */
  guideTexts: Record<string, { text: string; model: string; at: string }>;
}
