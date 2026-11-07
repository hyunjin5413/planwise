import { FACILITY_KINDS, OBJECT_CATALOG, roomUseFromName, type ObjectKind, type RoomUse } from "@/lib/domain/catalog";
import type { Box, BuildingInfo, Detection, FindingType, Point, Project, Sheet } from "@/lib/domain/types";
import { FINDING_TYPE_ORDER } from "@/lib/domain/types";
import {
  area,
  buildDoorGraph,
  buildWalkField,
  center,
  contains,
  describePosition,
  dist,
  distToBox,
  samplePoints,
  union,
} from "./geometry";
import { jo } from "./korean";
import { citeText, getCitation, ruleSetFor, type Citation, type RuleParams } from "./legal";
import { evaluateRequirements, kindRequirementsForFloor, type KindRequirement, type SystemRequirement } from "./requirements";

export const LOW_CONFIDENCE = 0.5;

export interface Finding {
  /** 재계산해도 유지되는 키 (사용자 조치를 연결) */
  key: string;
  /** 정렬 후 표시 번호 */
  no: number;
  type: FindingType;
  ruleId: string;
  title: string;
  sheetId: string | null;
  floorLabel: string | null;
  roomName: string | null;
  /** 도면에서 강조할 영역 (원본 픽셀 좌표) */
  location: Box | null;
  targetKinds: ObjectKind[];
  targetIds: string[];
  /** 무엇이 기준과 다른지 */
  content: string;
  measured: string | null;
  criterion: string | null;
  citation: Citation;
  /** 규칙 엔진이 만든 수정 가이드 (템플릿) */
  guide: string;
  /** 인식·판정 신뢰도 0~1 */
  confidence: number;
  /** LLM 가이드 생성에 넘길 근거 사실 */
  facts: Record<string, string | number>;
}

export type TallyStatus = "detected" | "missing_required" | "missing_not_required" | "pending" | "elsewhere";

export interface Tally {
  kind: ObjectKind;
  count: number;
  lowConfidence: number;
  required: boolean | null;
  status: TallyStatus;
  note: string;
}

export interface SheetReview {
  sheetId: string;
  tallies: Tally[];
}

export interface ReviewResult {
  ruleSetVersion: string | null;
  standardDate: string;
  requirements: SystemRequirement[] | null;
  sheets: SheetReview[];
  totals: Tally[];
  findings: Finding[];
  computedAt: string;
}

const m1 = (v: number) => `${v.toFixed(1)}m`;
const m2 = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}㎡`;

function roomUse(r: Detection): RoomUse {
  return r.roomUse ?? roomUseFromName(r.label);
}

function roomName(r: Detection | null): string {
  return r?.label?.trim() || "이름 없는 실";
}

interface Ctx {
  sheet: Sheet;
  params: RuleParams;
  building: BuildingInfo;
  date: string;
  /** 축척 (px/m). 미확정이면 null */
  ppm: number | null;
  rooms: Detection[];
  doors: Detection[];
  of: (k: ObjectKind) => Detection[];
  tolPx: number;
  cite: (id: string) => Citation;
  push: (f: Omit<Finding, "no" | "key" | "sheetId" | "floorLabel"> & { anchor: string }) => void;
}

function worstPoint(points: Point[], fn: (p: Point) => number): { p: Point; d: number } | null {
  let best: { p: Point; d: number } | null = null;
  for (const p of points) {
    const d = fn(p);
    if (!best || d > best.d) best = { p, d };
  }
  return best;
}

function sampleStep(ctx: Ctx, b: Box): number {
  const byScale = ctx.ppm ? ctx.ppm * 0.5 : Infinity;
  return Math.max(4, Math.min(byScale, Math.min(b.w, b.h) / 6));
}

function locate(p: Point, ctx: Ctx, r = 0.6): Box {
  const s = ctx.ppm ? ctx.ppm * r : 40;
  return { x: p.x - s, y: p.y - s, w: s * 2, h: s * 2 };
}

// ── 거리 기준 (축척 필요) ─────────────────────────────────────────────

function checkExtinguisherWalk(ctx: Ctx, req: KindRequirement | undefined) {
  const ext = ctx.of("extinguisher");
  if (!ctx.ppm || ext.length === 0 || !req?.required) return;
  const graph = buildDoorGraph(ctx.rooms, ctx.doors, ctx.tolPx);
  const field = buildWalkField(ctx.rooms, graph, ext.map((e) => center(e.box)), ctx.tolPx);
  const limit = ctx.params.extinguisherWalkM;
  const c = ctx.cite("NFTC101");
  for (const r of ctx.rooms) {
    const use = roomUse(r);
    if (use === "shaft" || use === "elevator") continue;
    const w = worstPoint(samplePoints(r.box, sampleStep(ctx, r.box)), (p) => field.distanceFrom(p).distance);
    if (!w) continue;
    if (w.d === Infinity) {
      ctx.push({
        anchor: `room:${r.id}`,
        type: "check",
        ruleId: "EXT-WALK",
        title: "소화기 보행거리 계산 불가",
        roomName: roomName(r),
        location: r.box,
        targetKinds: ["extinguisher", "door"],
        targetIds: [r.id],
        content: `${roomName(r)}에서 소화기까지 이어지는 출입문을 찾지 못해 보행거리를 계산하지 못했습니다.`,
        measured: null,
        criterion: `${limit}m 이내`,
        citation: c,
        guide: `${roomName(r)}의 출입문 박스가 빠졌는지 확인하고, 필요하면 출입문 박스를 추가한 뒤 다시 계산하십시오.`,
        confidence: 0.5,
        facts: { room: roomName(r), limitM: limit },
      });
      continue;
    }
    const meters = w.d / ctx.ppm;
    if (meters > limit) {
      const pos = describePosition(w.p, r.box);
      ctx.push({
        anchor: `room:${r.id}`,
        type: "violation",
        ruleId: "EXT-WALK",
        title: "소화기 보행거리 초과",
        roomName: roomName(r),
        location: locate(w.p, ctx, 1.2),
        targetKinds: ["extinguisher"],
        targetIds: [r.id],
        content: `${roomName(r)} ${pos}에서 가장 가까운 소화기까지 보행거리가 ${m1(meters)}로, 소형소화기 기준 ${limit}m를 넘습니다.`,
        measured: m1(meters),
        criterion: `${limit}m 이내 (소형소화기)`,
        citation: c,
        guide: `${use === "corridor" ? roomName(r) : `${roomName(r)} 또는 인접 복도`}에 소화기를 추가 배치해 각 부분으로부터 보행거리 ${limit}m 이내가 되도록 조정하십시오. 근거: ${citeText(c, ctx.date)}.`,
        confidence: 0.8,
        facts: { room: roomName(r), position: pos, measuredM: Number(meters.toFixed(1)), limitM: limit, extinguisherType: "소형소화기" },
      });
    }
  }
}

function checkExtinguisherRooms(ctx: Ctx, req: KindRequirement | undefined) {
  if (!ctx.ppm || !req?.required) return;
  const habitable = ctx.rooms.filter((r) => roomUse(r) === "habitable");
  if (habitable.length < 2) return;
  const ext = ctx.of("extinguisher");
  const c = ctx.cite("NFTC101-ROOM");
  const minArea = ctx.params.extinguisherRoomAreaM2;
  for (const r of habitable) {
    const a = area(r.box) / (ctx.ppm * ctx.ppm);
    if (a < minArea) continue;
    if (ext.some((e) => contains(r.box, center(e.box), ctx.tolPx * 0.5))) continue;
    ctx.push({
      anchor: `room:${r.id}`,
      type: "violation",
      ruleId: "EXT-ROOM",
      title: "구획된 거실에 소화기 없음",
      roomName: roomName(r),
      location: r.box,
      targetKinds: ["extinguisher"],
      targetIds: [r.id],
      content: `${jo(roomName(r), "은/는")} 바닥면적 약 ${m2(a)}로 ${minArea}㎡ 이상인 구획된 거실인데 소화기가 표시되어 있지 않습니다.`,
      measured: `약 ${m2(a)}`,
      criterion: `${minArea}㎡ 이상 거실마다 배치`,
      citation: c,
      guide: `${roomName(r)} 안에 소화기를 1개 이상 배치하십시오. 근거: ${citeText(c, ctx.date)}.`,
      confidence: 0.75,
      facts: { room: roomName(r), areaM2: Math.round(a), thresholdM2: minArea },
    });
  }
}

function checkSprinklerRadius(ctx: Ctx) {
  const heads = ctx.of("sprinkler_head");
  if (!ctx.ppm || heads.length === 0) return;
  const R = ctx.building.fireResistant ? ctx.params.sprinklerRadiusFireResistantM : ctx.params.sprinklerRadiusOtherM;
  const label = ctx.building.fireResistant ? "내화구조" : "내화구조가 아닌 건축물";
  const c = ctx.cite("NFTC103");
  for (const r of ctx.rooms) {
    const inRoom = heads.filter((h) => contains(r.box, center(h.box), ctx.tolPx * 0.3));
    if (inRoom.length === 0) continue;
    const pts = samplePoints(r.box, sampleStep(ctx, r.box));
    const w = worstPoint(pts, (p) => Math.min(...inRoom.map((h) => dist(p, center(h.box)))));
    if (!w) continue;
    const meters = w.d / ctx.ppm;
    if (meters > R + 0.05) {
      const pos = describePosition(w.p, r.box);
      ctx.push({
        anchor: `room:${r.id}`,
        type: "violation",
        ruleId: "SP-RADIUS",
        title: "스프링클러 헤드 수평거리 초과",
        roomName: roomName(r),
        location: locate(w.p, ctx),
        targetKinds: ["sprinkler_head"],
        targetIds: [r.id, ...inRoom.map((h) => h.id)],
        content: `${roomName(r)} ${pos} 모서리에서 가장 가까운 스프링클러 헤드까지 수평거리가 ${m1(meters)}로, ${label} 기준 ${R}m를 넘습니다.`,
        measured: m1(meters),
        criterion: `${R}m 이하 (${label})`,
        citation: c,
        guide: `헤드 1개를 추가하거나 배치 간격을 조정해 ${roomName(r)}의 모든 부분이 수평거리 ${R}m 이내에 들도록 하는 방안을 검토하십시오. 근거: ${citeText(c, ctx.date)}.`,
        confidence: 0.8,
        facts: { room: roomName(r), position: pos, measuredM: Number(meters.toFixed(1)), limitM: R, structure: label, headsInRoom: inRoom.length },
      });
    }
  }
}

function checkRadiusCoverage(
  ctx: Ctx,
  kind: "manual_call_point" | "alarm_bell",
  limit: number,
  citationId: string,
  req: KindRequirement | undefined,
) {
  const items = ctx.of(kind);
  if (!ctx.ppm || items.length === 0 || !req?.required) return;
  const label = OBJECT_CATALOG[kind].label;
  const c = ctx.cite(citationId);
  let worst: { p: Point; d: number; room: Detection } | null = null;
  for (const r of ctx.rooms) {
    const use = roomUse(r);
    if (use === "shaft" || use === "elevator") continue;
    const w = worstPoint(samplePoints(r.box, sampleStep(ctx, r.box)), (p) => Math.min(...items.map((i) => dist(p, center(i.box)))));
    if (w && (!worst || w.d > worst.d)) worst = { ...w, room: r };
  }
  if (!worst) return;
  const meters = worst.d / ctx.ppm;
  if (meters > limit) {
    const pos = describePosition(worst.p, worst.room.box);
    ctx.push({
      anchor: `floor:${kind}`,
      type: "violation",
      ruleId: kind === "manual_call_point" ? "MCP-RADIUS" : "BELL-RADIUS",
      title: `${label} 수평거리 초과`,
      roomName: roomName(worst.room),
      location: locate(worst.p, ctx, 1.5),
      targetKinds: [kind],
      targetIds: [worst.room.id],
      content: `${roomName(worst.room)} ${pos}에서 가장 가까운 ${label}까지 수평거리가 ${m1(meters)}로, 기준 ${limit}m를 넘습니다.`,
      measured: m1(meters),
      criterion: `${limit}m 이하`,
      citation: c,
      guide: `${jo(label, "을/를")} 추가하거나 위치를 옮겨 층의 각 부분으로부터 수평거리 ${limit}m 이내가 되도록 하십시오. 근거: ${citeText(c, ctx.date)}.`,
      confidence: 0.8,
      facts: { room: roomName(worst.room), position: pos, measuredM: Number(meters.toFixed(1)), limitM: limit, device: label },
    });
  }
}

function checkCorridorGuides(ctx: Ctx, req: KindRequirement | undefined) {
  if (!ctx.ppm || !req?.required) return;
  const lights = ctx.of("corridor_guide_light");
  const spacing = ctx.params.corridorGuideSpacingM;
  const c = ctx.cite("NFTC303-CORRIDOR");
  for (const r of ctx.rooms.filter((r) => roomUse(r) === "corridor")) {
    const horizontal = r.box.w >= r.box.h;
    const lengthM = (horizontal ? r.box.w : r.box.h) / ctx.ppm;
    // NFTC 303 2.8.2: 길이 30m 미만 직선 복도는 설치 제외 (실 박스는 직선 복도로 본다)
    if (lengthM < ctx.params.corridorGuideExemptLengthM) continue;
    const inside = lights.filter((l) => contains(r.box, center(l.box), ctx.tolPx));
    const axis = (p: Point) => (horizontal ? p.x - r.box.x : p.y - r.box.y) / ctx.ppm!;
    const positions = [0, ...inside.map((l) => axis(center(l.box))).sort((a, b) => a - b), lengthM];
    let gap = 0;
    for (let i = 1; i < positions.length; i++) gap = Math.max(gap, positions[i] - positions[i - 1]);
    if (inside.length === 0 || gap > spacing) {
      ctx.push({
        anchor: `room:${r.id}`,
        type: inside.length === 0 ? "violation" : "check",
        ruleId: "CORRIDOR-GUIDE",
        title: inside.length === 0 ? "복도통로유도등 없음" : "복도통로유도등 간격 확인",
        roomName: roomName(r),
        location: r.box,
        targetKinds: ["corridor_guide_light"],
        targetIds: [r.id],
        content:
          inside.length === 0
            ? `${roomName(r)}(길이 약 ${m1(lengthM)})에 통로유도등이 표시되어 있지 않습니다.`
            : `${roomName(r)}(길이 약 ${m1(lengthM)})의 통로유도등 사이 또는 끝단까지 간격이 최대 ${m1(gap)}입니다. 구부러진 모퉁이와 보행거리 기준으로 다시 확인이 필요합니다.`,
        measured: inside.length === 0 ? "0개" : m1(gap),
        criterion: `보행거리 ${spacing}m마다`,
        citation: c,
        guide: `${roomName(r)}에 보행거리 ${spacing}m마다, 그리고 구부러진 모퉁이마다 복도통로유도등을 배치하십시오. 근거: ${citeText(c, ctx.date)}.`,
        confidence: 0.6,
        facts: { room: roomName(r), corridorLengthM: Number(lengthM.toFixed(1)), maxGapM: Number(gap.toFixed(1)), spacingM: spacing, count: inside.length },
      });
    }
  }
}

function stairEntrances(ctx: Ctx): { points: Point[]; ids: string[] } {
  const stairRooms = ctx.rooms.filter((r) => roomUse(r) === "stair");
  const graph = buildDoorGraph(ctx.rooms, ctx.doors, ctx.tolPx);
  const points: Point[] = [];
  const ids: string[] = [];
  for (const r of stairRooms) {
    const doorIds = graph.roomDoors.get(r.id) ?? [];
    const doors = ctx.doors.filter((d) => doorIds.includes(d.id));
    if (doors.length > 0) {
      points.push(...doors.map((d) => center(d.box)));
    } else {
      points.push(center(r.box));
    }
    ids.push(r.id);
  }
  // 실로 잡히지 않은 계단 박스
  for (const s of ctx.of("stair")) {
    if (stairRooms.some((r) => contains(r.box, center(s.box), ctx.tolPx))) continue;
    points.push(center(s.box));
    ids.push(s.id);
  }
  return { points, ids };
}

function countStairs(ctx: Ctx): number {
  const stairRooms = ctx.rooms.filter((r) => roomUse(r) === "stair");
  const loose = ctx.of("stair").filter((s) => !stairRooms.some((r) => contains(r.box, center(s.box), ctx.tolPx)));
  return stairRooms.length + loose.length;
}

function checkStairs(ctx: Ctx, sprinklered: boolean) {
  const level = ctx.sheet.level;
  const habitable = ctx.rooms.filter((r) => roomUse(r) === "habitable");
  const floorInfo = ctx.building.floors.find((f) => f.level === level);
  const habitableArea = ctx.ppm
    ? habitable.reduce((s, r) => s + area(r.box) / (ctx.ppm! * ctx.ppm!), 0)
    : (floorInfo?.area ?? null);
  const stairs = countStairs(ctx);
  const p = ctx.params;

  // 직통계단 개수 (건축법 시행령 제34조 제2항)
  let needTwo = false;
  if (level != null && habitableArea != null) {
    needTwo = (level >= 3 && habitableArea >= p.twoStairsAreaM2) || (level < 0 && habitableArea >= p.twoStairsBasementAreaM2);
  }
  const c2 = ctx.cite("BA-34-2");
  if (needTwo && stairs < 2) {
    ctx.push({
      anchor: "floor:stair-count",
      type: "violation",
      ruleId: "STAIR-COUNT",
      title: "직통계단 개수 부족",
      roomName: null,
      location: union(ctx.rooms.map((r) => r.box)),
      targetKinds: ["stair"],
      targetIds: [],
      content: `${ctx.sheet.floorLabel} 거실 바닥면적 합계가 약 ${m2(habitableArea!)}로 직통계단 2개소 이상 설치 대상인데, 도면에서 계단을 ${stairs}개만 찾았습니다.`,
      measured: `${stairs}개소`,
      criterion: "2개소 이상",
      citation: c2,
      guide: `직통계단을 추가하거나, 인식되지 않은 계단이 있다면 계단 박스를 추가한 뒤 다시 검토하십시오. 직통계단에 해당하는지는 단면·전층 도면으로 확인이 필요합니다. 근거: ${citeText(c2, ctx.date)}.`,
      confidence: 0.6,
      facts: { floor: ctx.sheet.floorLabel, habitableAreaM2: Math.round(habitableArea!), stairs, thresholdM2: level != null && level < 0 ? p.twoStairsBasementAreaM2 : p.twoStairsAreaM2 },
    });
  }

  if (!ctx.ppm || stairs === 0) return;
  const entrances = stairEntrances(ctx);

  // 직통계단까지 보행거리 (건축법 시행령 제34조 제1항)
  const limit = ctx.building.fireResistant ? p.stairWalkFireResistantM : p.stairWalkM;
  const c1 = ctx.cite("BA-34-1");
  const graph = buildDoorGraph(ctx.rooms, ctx.doors, ctx.tolPx);
  const field = buildWalkField(ctx.rooms, graph, entrances.points, ctx.tolPx);
  for (const r of habitable) {
    const w = worstPoint(samplePoints(r.box, sampleStep(ctx, r.box)), (pt) => field.distanceFrom(pt).distance);
    if (!w || w.d === Infinity) continue;
    const meters = w.d / ctx.ppm;
    if (meters > limit) {
      const pos = describePosition(w.p, r.box);
      ctx.push({
        anchor: `room:${r.id}`,
        type: "violation",
        ruleId: "STAIR-WALK",
        title: "직통계단 보행거리 초과",
        roomName: roomName(r),
        location: locate(w.p, ctx, 1.2),
        targetKinds: ["stair"],
        targetIds: [r.id],
        content: `${roomName(r)} ${pos}에서 가장 가까운 계단 출입구까지 보행거리가 ${m1(meters)}로, 기준 ${limit}m를 넘습니다.`,
        measured: m1(meters),
        criterion: `${limit}m 이하${ctx.building.fireResistant ? " (주요구조부 내화구조)" : ""}`,
        citation: c1,
        guide: `실 배치나 출입구 위치를 조정하거나 직통계단을 추가해 거실 각 부분에서 계단까지 보행거리가 ${limit}m 이하가 되도록 검토하십시오. 근거: ${citeText(c1, ctx.date)}.`,
        confidence: 0.7,
        facts: { room: roomName(r), position: pos, measuredM: Number(meters.toFixed(1)), limitM: limit },
      });
    }
  }

  // 직통계단 출입구 이격 (피난·방화구조 규칙 제8조)
  if (needTwo && entrances.ids.length >= 2) {
    const env = union(ctx.rooms.map((r) => r.box));
    if (!env) return;
    const diag = Math.hypot(env.w, env.h) / ctx.ppm;
    const ratio = sprinklered ? p.stairSeparationRatioSprinklered : p.stairSeparationRatio;
    // 가장 멀리 위치한 계단 2개소를 고르고, 그 두 계단 출입구 간 가장 가까운 직선거리를 잰다
    const groups = groupEntrancesByStair(ctx, entrances);
    let farthestPair = -Infinity;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        let nearest = Infinity;
        for (const a of groups[i]) for (const b of groups[j]) nearest = Math.min(nearest, dist(a, b));
        farthestPair = Math.max(farthestPair, nearest);
      }
    if (!Number.isFinite(farthestPair)) return;
    const sep = farthestPair / ctx.ppm;
    const need = diag * ratio;
    if (sep < need) {
      const c3 = ctx.cite("EVAC-8");
      ctx.push({
        anchor: "floor:stair-separation",
        type: "violation",
        ruleId: "STAIR-SEP",
        title: "직통계단 출입구 이격 거리 부족",
        roomName: null,
        location: env,
        targetKinds: ["stair"],
        targetIds: entrances.ids,
        content: `가장 멀리 위치한 직통계단 2개소의 출입구 간 가장 가까운 직선거리가 ${m1(sep)}로, 평면 최대 대각선(${m1(diag)})의 ${sprinklered ? "1/3" : "1/2"}인 ${m1(need)}보다 짧습니다.`,
        measured: m1(sep),
        criterion: `${m1(need)} 이상 (최대 대각선의 ${sprinklered ? "1/3" : "1/2"})`,
        citation: c3,
        guide: `계단 출입구 위치를 서로 멀리 떨어지도록 조정하는 방안을 검토하십시오. 근거: ${citeText(c3, ctx.date)}.`,
        confidence: 0.65,
        facts: { separationM: Number(sep.toFixed(1)), diagonalM: Number(diag.toFixed(1)), requiredM: Number(need.toFixed(1)), ratio: sprinklered ? "1/3" : "1/2" },
      });
    }
  }
}

function groupEntrancesByStair(ctx: Ctx, entrances: { points: Point[]; ids: string[] }): Point[][] {
  const groups: Point[][] = [];
  const stairRooms = ctx.rooms.filter((r) => roomUse(r) === "stair");
  const used = new Set<number>();
  for (const r of stairRooms) {
    const g: Point[] = [];
    entrances.points.forEach((p, i) => {
      if (!used.has(i) && distToBox(p, r.box) <= ctx.tolPx * 2) {
        g.push(p);
        used.add(i);
      }
    });
    if (g.length) groups.push(g);
  }
  entrances.points.forEach((p, i) => {
    if (!used.has(i)) groups.push([p]);
  });
  return groups;
}

// ── 축척 없이 가능한 판정 ─────────────────────────────────────────────

function checkExitSigns(ctx: Ctx, req: KindRequirement | undefined) {
  if (!req?.required) return;
  const signs = ctx.of("exit_sign");
  const graph = buildDoorGraph(ctx.rooms, ctx.doors, ctx.tolPx);
  const stairRoomIds = new Set(ctx.rooms.filter((r) => roomUse(r) === "stair").map((r) => r.id));
  const c = ctx.cite("NFTC303-EXIT");
  for (const d of ctx.doors) {
    const adj = graph.doorRooms.get(d.id) ?? [];
    const toStair = adj.some((id) => stairRoomIds.has(id));
    const exterior = graph.exteriorDoorIds.has(d.id);
    if (!toStair && !exterior) continue;
    const near = ctx.ppm ? ctx.params.exitSignNearDoorM * ctx.ppm : Math.max(d.box.w, d.box.h) * 2.2;
    const hit = signs.find((s) => distToBox(center(s.box), d.box) <= near);
    if (hit) continue;
    const place = toStair ? `${roomName(ctx.rooms.find((r) => r.id === adj.find((id) => stairRoomIds.has(id))) ?? null)} 출입구` : "옥외로 통하는 출입구";
    // NFTC 303 2.8.1.1: 바닥면적 1,000㎡ 미만 층의 외부 출입구는 외부 식별이 쉬우면 설치 제외
    const floorArea = ctx.building.floors.find((f) => f.level === ctx.sheet.level)?.area ?? null;
    const maybeExempt = !toStair && floorArea != null && floorArea < ctx.params.exitSignExemptFloorAreaM2;
    const ce = ctx.cite("NFTC303-EXIT-EXEMPT");
    ctx.push({
      anchor: `door:${d.id}`,
      type: maybeExempt || d.confidence < LOW_CONFIDENCE ? "check" : "violation",
      ruleId: "EXIT-SIGN",
      title: maybeExempt ? "피난구유도등 설치 제외 여부 확인" : "피난구유도등 미표시",
      roomName: place,
      location: d.box,
      targetKinds: ["exit_sign", "door"],
      targetIds: [d.id],
      content: maybeExempt
        ? `${place}에 피난구유도등이 표시되어 있지 않습니다. 이 층 바닥면적이 ${m2(floorArea!)}로 ${ctx.params.exitSignExemptFloorAreaM2.toLocaleString("ko-KR")}㎡ 미만이어서, 외부에서 출입구를 쉽게 식별할 수 있으면 설치 제외 대상입니다.`
        : `${place}에 피난구유도등이 표시되어 있지 않습니다.`,
      measured: "0개",
      criterion: "출입구마다 설치",
      citation: c,
      guide: maybeExempt
        ? `외부에서 출입구를 쉽게 식별할 수 있으면 ${ce.short} ${ce.article}에 따라 확인 처리하고, 그렇지 않으면 출입구 상부에 피난구유도등을 반영하십시오. 근거: ${citeText(c, ctx.date)}.`
        : `${place} 상부에 피난구유도등을 설치하도록 도면에 반영하십시오. 근거: ${citeText(c, ctx.date)}.`,
      confidence: Math.min(0.8, d.confidence),
      facts: {
        place,
        doorType: toStair ? "직통계단·계단실 출입구" : "옥내에서 직접 지상으로 통하는 출입구",
        ...(maybeExempt ? { floorAreaM2: Math.round(floorArea!), exemptBelowM2: ctx.params.exitSignExemptFloorAreaM2 } : {}),
      },
    });
  }
}

function checkRoomsWithout(
  ctx: Ctx,
  kinds: ObjectKind[],
  ruleId: string,
  label: string,
  citationId: string,
  exemptCitationId: string,
  exempt: RoomUse[],
) {
  const items = kinds.flatMap((k) => ctx.of(k));
  const c = ctx.cite(citationId);
  const ce = ctx.cite(exemptCitationId);
  for (const r of ctx.rooms) {
    const use = roomUse(r);
    if (exempt.includes(use)) continue;
    if (items.some((i) => contains(r.box, center(i.box), ctx.tolPx * 0.3))) continue;
    // 감지기: 일반 화장실은 제외 장소가 아니고, 욕조·샤워시설이 있는 화장실만 제외 (NFTC 203 2.4.5.5)
    const toiletNote =
      use === "toilet" && kinds.includes("smoke_detector")
        ? " 욕조나 샤워시설이 있는 화장실이면 설치 제외 장소이고, 일반 화장실은 설치 대상입니다."
        : "";
    ctx.push({
      anchor: `room:${r.id}`,
      type: "check",
      ruleId,
      title: `${label} 없는 실`,
      roomName: roomName(r),
      location: r.box,
      targetKinds: kinds,
      targetIds: [r.id],
      content: `${roomName(r)}에 ${jo(label, "이/가")} 하나도 표시되어 있지 않습니다. 설치 제외 장소에 해당하는지 확인이 필요합니다.${toiletNote}`,
      measured: "0개",
      criterion: "설치 제외 장소가 아니면 설치",
      citation: c,
      guide: `${jo(roomName(r), "이/가")} ${ce.short} ${ce.article}에 따른 설치 제외 장소에 해당하지 않으면 ${jo(label, "을/를")} 배치하십시오. 해당하면 확인 처리하고 사유를 메모로 남기십시오.`,
      confidence: 0.6,
      facts: { room: roomName(r), roomUse: use, device: label },
    });
  }
}

function checkSmokeLocations(ctx: Ctx) {
  const smoke = ctx.of("smoke_detector");
  const heat = ctx.of("heat_detector");
  const c = ctx.cite("NFTC203-SMOKE");
  for (const r of ctx.rooms) {
    const use = roomUse(r);
    if (use !== "corridor" && use !== "stair") continue;
    if (use === "corridor" && ctx.ppm) {
      const len = Math.max(r.box.w, r.box.h) / ctx.ppm;
      if (len < ctx.params.smokeCorridorMinLengthM) continue;
    }
    const smokeIn = smoke.filter((s) => contains(r.box, center(s.box), ctx.tolPx * 0.3));
    const hasHeat = heat.some((s) => contains(r.box, center(s.box), ctx.tolPx * 0.3));
    if (smokeIn.length > 0) {
      if (use === "corridor" && ctx.ppm) checkSmokeSpacing(ctx, r, smokeIn);
      continue;
    }
    if (!hasHeat) continue;
    ctx.push({
      anchor: `room:${r.id}`,
      type: "violation",
      ruleId: "DET-SMOKE",
      title: "연기감지기 설치 장소에 열감지기",
      roomName: roomName(r),
      location: r.box,
      targetKinds: ["smoke_detector", "heat_detector"],
      targetIds: [r.id],
      content: `${jo(roomName(r), "은/는")} 연기감지기 설치 장소인데 열감지기만 표시되어 있습니다.`,
      measured: "연기감지기 0개",
      criterion: "연기감지기 설치",
      citation: c,
      guide: `${roomName(r)}의 감지기를 연기감지기로 변경하십시오. 근거: ${citeText(c, ctx.date)}.`,
      confidence: 0.7,
      facts: { room: roomName(r), roomUse: use },
    });
  }
}

/** NFTC 203 2.4.3.10.2: 복도 연기감지기는 보행거리 30m마다 1개 이상 (1·2종 가정) */
function checkSmokeSpacing(ctx: Ctx, r: Detection, smokeIn: Detection[]) {
  const ppm = ctx.ppm!;
  const horizontal = r.box.w >= r.box.h;
  const lengthM = (horizontal ? r.box.w : r.box.h) / ppm;
  const axis = (p: Point) => (horizontal ? p.x - r.box.x : p.y - r.box.y) / ppm;
  const pos = smokeIn.map((s) => axis(center(s.box))).sort((a, b) => a - b);
  let gap = Math.max(pos[0], lengthM - pos[pos.length - 1]);
  for (let i = 1; i < pos.length; i++) gap = Math.max(gap, pos[i] - pos[i - 1]);
  const limit = ctx.params.smokeCorridorSpacingM;
  if (gap <= limit) return;
  const c = ctx.cite("NFTC203-CORRIDOR");
  ctx.push({
    anchor: `room:${r.id}:smoke-spacing`,
    type: "violation",
    ruleId: "DET-CORRIDOR",
    title: "복도 연기감지기 간격 초과",
    roomName: roomName(r),
    location: r.box,
    targetKinds: ["smoke_detector"],
    targetIds: [r.id, ...smokeIn.map((s) => s.id)],
    content: `${roomName(r)}(길이 약 ${m1(lengthM)})의 연기감지기 간격 또는 끝단까지 거리가 최대 ${m1(gap)}로, 1·2종 기준 보행거리 ${limit}m를 넘습니다.`,
    measured: m1(gap),
    criterion: `보행거리 ${limit}m마다 1개 이상 (1·2종)`,
    citation: c,
    guide: `${roomName(r)}에 연기감지기를 추가해 보행거리 ${limit}m(3종은 20m)마다 1개 이상이 되도록 하십시오. 근거: ${citeText(c, ctx.date)}.`,
    confidence: 0.7,
    facts: { room: roomName(r), corridorLengthM: Number(lengthM.toFixed(1)), maxGapM: Number(gap.toFixed(1)), limitM: limit, detectorClass: "1종 또는 2종 가정" },
  });
}

// ── 집계 ─────────────────────────────────────────────────────────────

function tallyFor(kind: ObjectKind, dets: Detection[], req: KindRequirement | undefined): Tally {
  const items = dets.filter((d) => d.kind === kind);
  const low = items.filter((d) => d.confidence < LOW_CONFIDENCE).length;
  const required = req ? req.required : null;
  let status: TallyStatus;
  let note = req?.reason ?? "";
  if (items.length > 0) status = "detected";
  else if (required === null) status = "pending";
  else if (required) status = "missing_required";
  else status = "missing_not_required";
  if (status === "detected" && low > 0) note = `확인 필요 ${low}개 포함`;
  return { kind, count: items.length, lowConfidence: low, required, status, note };
}

export function reviewProject(project: Project, sheets: Sheet[]): ReviewResult {
  const date = project.standardDate;
  const ruleSet = ruleSetFor(date);
  const cite = (id: string) => getCitation(id, date);
  const findings: Omit<Finding, "no">[] = [];
  const keys = new Set<string>();
  const add = (f: Omit<Finding, "no">) => {
    let key = f.key;
    let i = 2;
    while (keys.has(key)) key = `${f.key}#${i++}`;
    keys.add(key);
    findings.push({ ...f, key });
  };

  const building = project.building;
  const requirements = building.confirmed ? evaluateRequirements(building) : null;

  if (!ruleSet) {
    add({
      key: "project:no-ruleset",
      type: "pending",
      ruleId: "RULESET",
      title: "기준일에 맞는 규칙 없음",
      sheetId: null,
      floorLabel: null,
      roomName: null,
      location: null,
      targetKinds: [],
      targetIds: [],
      content: `적용 기준일 ${date}에 시행 중인 규칙 버전이 없어 판정하지 못했습니다.`,
      measured: null,
      criterion: null,
      citation: cite("ENF-ATT4"),
      guide: "적용 기준일을 확인하십시오.",
      confidence: 1,
      facts: { date },
    });
  }

  if (!building.confirmed) {
    add({
      key: "project:building-unconfirmed",
      type: "pending",
      ruleId: "REQ-BUILDING",
      title: "건물 정보 미확인",
      sheetId: null,
      floorLabel: null,
      roomName: null,
      location: null,
      targetKinds: [],
      targetIds: [],
      content: "용도, 층수, 층별 바닥면적 등 건물 정보를 확인하지 않아 설치 대상 판정과 누락 판정을 보류했습니다.",
      measured: null,
      criterion: null,
      citation: cite("ENF-ATT4"),
      guide: "건물 정보 확인 단계에서 값을 확인하고 저장하면 설치 대상과 누락 여부가 계산됩니다.",
      confidence: 1,
      facts: {},
    });
  }

  const sheetReviews: SheetReview[] = [];
  const allPlanDetections: Detection[] = [];
  const buildingScopeReqs = new Map<ObjectKind, KindRequirement>();
  const sprinkleredEverywhere = !!requirements?.find((r) => r.system === "sprinkler" && r.required && r.levels === null);

  for (const sheet of sheets) {
    if (sheet.kind !== "floor_plan") {
      sheetReviews.push({ sheetId: sheet.id, tallies: [] });
      continue;
    }
    const dets = sheet.detections;
    allPlanDetections.push(...dets);
    const rooms = dets.filter((d) => d.kind === "room");
    const hasCorridor = rooms.some((r) => roomUse(r) === "corridor");
    const hasStairOrCorridor = hasCorridor || rooms.some((r) => roomUse(r) === "stair") || dets.some((d) => d.kind === "stair");
    const kreqs = kindRequirementsForFloor(requirements, sheet.level, {
      hasCorridor,
      hasStairOrCorridor,
      heatDetectorCount: dets.filter((d) => d.kind === "heat_detector").length,
    });
    for (const [k, r] of kreqs) if (r.scope === "building") buildingScopeReqs.set(k, r);

    const tallies = FACILITY_KINDS.map((k) => tallyFor(k, dets, kreqs.get(k)));
    sheetReviews.push({ sheetId: sheet.id, tallies });

    // 누락 의심 (층 단위)
    for (const t of tallies) {
      const req = kreqs.get(t.kind);
      if (t.status !== "missing_required" || !req || req.scope !== "floor") continue;
      const info = OBJECT_CATALOG[t.kind];
      const c = cite("ENF-ATT4");
      add({
        key: `MISSING|${sheet.id}|${t.kind}`,
        type: "missing",
        ruleId: "REQ-MISSING",
        title: `${info.label} 없음, 설치 필요`,
        sheetId: sheet.id,
        floorLabel: sheet.floorLabel,
        roomName: null,
        location: null,
        targetKinds: [t.kind],
        targetIds: [],
        content: `${sheet.floorLabel} 도면에서 ${jo(info.label, "을/를")} 찾지 못했습니다. ${req.reason}이므로 설치 의무가 있습니다.`,
        measured: "0개",
        criterion: "1개 이상",
        citation: c,
        guide: `${sheet.floorLabel} 도면에 ${jo(info.label, "이/가")} 실제로 빠졌는지, 출력에서 해당 레이어가 누락됐는지 확인하십시오. 도면에 있는데 인식되지 않았다면 박스를 추가하십시오. 근거: ${citeText(c, date)}.`,
        confidence: 0.85,
        facts: { floor: sheet.floorLabel, device: info.label, reason: req.reason },
      });
    }

    if (!ruleSet) continue;
    const ppm = sheet.scale.confirmed && sheet.scale.pxPerMeter ? sheet.scale.pxPerMeter : null;
    const tolPx = ppm ? ppm * 0.6 : Math.max(sheet.width, sheet.height) * 0.008;
    const byKind = new Map<ObjectKind, Detection[]>();
    for (const d of dets) {
      if (!byKind.has(d.kind)) byKind.set(d.kind, []);
      byKind.get(d.kind)!.push(d);
    }
    const ctx: Ctx = {
      sheet,
      params: ruleSet.params,
      building,
      date,
      ppm,
      rooms,
      doors: byKind.get("door") ?? [],
      of: (k) => byKind.get(k) ?? [],
      tolPx,
      cite,
      push: ({ anchor, ...f }) =>
        add({ ...f, key: `${f.ruleId}|${sheet.id}|${anchor}`, sheetId: sheet.id, floorLabel: sheet.floorLabel }),
    };

    if (!ppm) {
      add({
        key: `SCALE|${sheet.id}`,
        type: "pending",
        ruleId: "SCALE",
        title: "축척 미확정으로 거리 판정 보류",
        sheetId: sheet.id,
        floorLabel: sheet.floorLabel,
        roomName: null,
        location: null,
        targetKinds: ["sprinkler_head", "extinguisher", "manual_call_point", "alarm_bell", "stair"],
        targetIds: [],
        content: "축척이 확정되지 않아 스프링클러 헤드 수평거리, 소화기 보행거리, 직통계단 보행거리 등 거리 기준 판정을 보류했습니다.",
        measured: null,
        criterion: null,
        citation: cite("NFTC103"),
        guide: "축척 확인 단계에서 추정 축척을 확인하거나, 길이를 아는 두 점을 클릭해 보정하십시오.",
        confidence: 1,
        facts: {},
      });
    }

    if (rooms.length === 0) {
      add({
        key: `ROOMS|${sheet.id}`,
        type: "pending",
        ruleId: "ROOMS",
        title: "실 경계를 찾지 못함",
        sheetId: sheet.id,
        floorLabel: sheet.floorLabel,
        roomName: null,
        location: null,
        targetKinds: ["room"],
        targetIds: [],
        content: "도면에서 실 경계를 찾지 못해 실별 설치 여부와 거리 기준 판정을 보류했습니다.",
        measured: null,
        criterion: null,
        citation: cite("NFTC103"),
        guide: "결과 화면에서 실 박스를 추가하고 실 이름을 입력하면 다시 계산됩니다.",
        confidence: 1,
        facts: {},
      });
    }

    const p = ruleSet.params;
    checkExtinguisherWalk(ctx, kreqs.get("extinguisher"));
    checkExtinguisherRooms(ctx, kreqs.get("extinguisher"));
    checkSprinklerRadius(ctx);
    checkRadiusCoverage(ctx, "manual_call_point", p.callPointRadiusM, "NFTC203-MCP", kreqs.get("manual_call_point"));
    checkRadiusCoverage(ctx, "alarm_bell", p.bellRadiusM, "NFTC203-BELL", kreqs.get("alarm_bell"));
    checkCorridorGuides(ctx, kreqs.get("corridor_guide_light"));
    checkExitSigns(ctx, kreqs.get("exit_sign"));
    if (kreqs.get("sprinkler_head")?.required && ctx.of("sprinkler_head").length > 0) {
      checkRoomsWithout(ctx, ["sprinkler_head"], "SP-ROOM", "스프링클러 헤드", "NFTC103", "NFTC103-EXEMPT", [
        "stair",
        "toilet",
        "elevator",
        "shaft",
      ]);
    }
    if (kreqs.get("smoke_detector")?.required || kreqs.get("manual_call_point")?.required) {
      const detectors = ctx.of("smoke_detector").length + ctx.of("heat_detector").length;
      if (requirements?.find((r) => r.system === "fire_detection")?.required && detectors > 0) {
        checkRoomsWithout(ctx, ["smoke_detector", "heat_detector"], "DET-ROOM", "감지기", "NFTC203-EXEMPT", "NFTC203-EXEMPT", [
          "stair",
          "elevator",
          "shaft",
        ]);
        checkSmokeLocations(ctx);
      }
    }
    checkStairs(ctx, sprinkleredEverywhere);
  }

  // 건물 단위 시설 (수신기, 옥외소화전)
  const totals = FACILITY_KINDS.map((k) => {
    const req = buildingScopeReqs.get(k) ?? mergeFloorReqs(k, sheetReviews);
    const t = tallyFor(k, allPlanDetections, req);
    return t;
  });
  for (const t of totals) {
    const req = buildingScopeReqs.get(t.kind);
    if (!req || t.status !== "missing_required") continue;
    const info = OBJECT_CATALOG[t.kind];
    const c = cite("ENF-ATT4");
    add({
      key: `MISSING|building|${t.kind}`,
      type: req.notOnFloorPlan ? "check" : "missing",
      ruleId: "REQ-MISSING",
      title: req.notOnFloorPlan ? `${info.label} 배치도 확인 필요` : `${info.label} 없음, 설치 필요`,
      sheetId: null,
      floorLabel: null,
      roomName: null,
      location: null,
      targetKinds: [t.kind],
      targetIds: [],
      content: req.notOnFloorPlan
        ? `${req.reason}입니다. ${jo(info.label, "은/는")} 평면도가 아닌 배치도에 표시되므로 배치도에서 확인이 필요합니다.`
        : `올린 평면도 전체에서 ${jo(info.label, "을/를")} 찾지 못했습니다. ${req.reason}입니다.`,
      measured: "0개",
      criterion: "건물에 1개 이상",
      citation: c,
      guide: req.notOnFloorPlan
        ? `배치도를 확인하거나 업로드해 ${info.label} 설치 여부를 확인하십시오.`
        : `${jo(info.label, "이/가")} 표시된 층(방재실, 관리실 등) 도면을 함께 올렸는지 확인하십시오. 근거: ${citeText(c, date)}.`,
      confidence: 0.7,
      facts: { device: info.label, reason: req.reason },
    });
  }
  // 건물 단위 시설이 일부 층에만 있는 경우 층별 집계에 "다른 층" 표시
  for (const sr of sheetReviews) {
    for (const t of sr.tallies) {
      const total = totals.find((x) => x.kind === t.kind);
      if (buildingScopeReqs.has(t.kind) && t.count === 0 && total && total.count > 0) {
        t.status = "elsewhere";
        t.note = `다른 층에 ${total.count}개`;
      }
    }
  }

  // 정렬: 유형 순서 → 층 → 규칙
  const levelOf = (f: Omit<Finding, "no">) => sheets.find((s) => s.id === f.sheetId)?.level ?? -999;
  findings.sort(
    (a, b) =>
      FINDING_TYPE_ORDER.indexOf(a.type) - FINDING_TYPE_ORDER.indexOf(b.type) ||
      levelOf(a) - levelOf(b) ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.key.localeCompare(b.key),
  );

  return {
    ruleSetVersion: ruleSet?.version ?? null,
    standardDate: date,
    requirements,
    sheets: sheetReviews,
    totals,
    findings: findings.map((f, i) => ({ ...f, no: i + 1 })),
    computedAt: new Date().toISOString(),
  };

  function mergeFloorReqs(kind: ObjectKind, reviews: SheetReview[]): KindRequirement | undefined {
    const ts = reviews.flatMap((r) => r.tallies.filter((t) => t.kind === kind));
    if (ts.length === 0) return undefined;
    const anyRequired = ts.some((t) => t.required === true);
    const anyPending = ts.some((t) => t.required === null);
    const required = anyRequired ? true : anyPending ? null : false;
    const note = ts.find((t) => t.required === required)?.note ?? "";
    return { kind, required, scope: "floor", systems: [], reason: note };
  }
}

/** 판정에 쓰는 실 용도 (외부에서도 사용) */
export { roomUse as roomUseOf };
