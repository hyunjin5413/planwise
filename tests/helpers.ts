import type { ObjectKind } from "@/lib/domain/catalog";
import type { BuildingInfo, Detection, Project, Sheet } from "@/lib/domain/types";

/** 테스트 도면 축척: 1m = 50px */
export const PPM = 50;

let seq = 0;

/** 미터 단위 좌표로 객체를 만든다 (x, y, w, h는 m) */
export function obj(kind: ObjectKind, x: number, y: number, w: number, h: number, label?: string, confidence = 0.95): Detection {
  return {
    id: `${kind}-${++seq}`,
    kind,
    box: { x: x * PPM, y: y * PPM, w: w * PPM, h: h * PPM },
    confidence,
    source: "user",
    label,
  };
}

/** 점 객체 (심볼). 중심 좌표(m)에 0.4m 박스 */
export function sym(kind: ObjectKind, cx: number, cy: number, confidence = 0.95): Detection {
  return obj(kind, cx - 0.2, cy - 0.2, 0.4, 0.4, undefined, confidence);
}

/** 문: 벽 위 중심(m), 가로 방향 문이면 horizontal */
export function door(cx: number, cy: number, horizontal = true): Detection {
  return horizontal ? obj("door", cx - 0.45, cy - 0.15, 0.9, 0.3) : obj("door", cx - 0.15, cy - 0.45, 0.3, 0.9);
}

export function building(over: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    use: "neighborhood",
    useDetail: "",
    aboveGroundFloors: 3,
    basementFloors: 0,
    floors: [
      { level: 1, label: "1층", area: 450, windowless: false },
      { level: 2, label: "2층", area: 450, windowless: false },
      { level: 3, label: "3층", area: 450, windowless: false },
    ],
    totalArea: null,
    fireResistant: true,
    occupants: null,
    confirmed: true,
    ...over,
  };
}

export function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "테스트",
    address: "",
    standardDate: "2026-11-07",
    createdAt: "2026-11-07T00:00:00Z",
    updatedAt: "2026-11-07T00:00:00Z",
    building: building(),
    findingActions: {},
    guideTexts: {},
    ...over,
  };
}

export function sheet(detections: Detection[], over: Partial<Sheet> = {}): Sheet {
  return {
    id: "s1",
    projectId: "p1",
    name: "test.png",
    kind: "floor_plan",
    floorLabel: "3층",
    level: 3,
    imageKey: "img",
    width: 2000,
    height: 1000,
    createdAt: "2026-11-07T00:00:00Z",
    scale: { pxPerMeter: PPM, confirmed: true, method: "calibration", ratioText: "1:100", estimates: [], calibration: null },
    quality: { width: 2000, height: 1000, dpi: 300, sharpness: null, issues: [] },
    analysis: { status: "done" },
    detections,
    ...over,
  };
}
