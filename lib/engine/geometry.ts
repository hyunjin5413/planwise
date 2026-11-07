import type { Box, Detection, Point } from "@/lib/domain/types";

export function center(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function area(b: Box): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function contains(b: Box, p: Point, tol = 0): boolean {
  return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
}

export function expand(b: Box, d: number): Box {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function intersection(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

export function iou(a: Box, b: Box): number {
  const i = intersection(a, b);
  if (!i) return 0;
  const ia = area(i);
  return ia / (area(a) + area(b) - ia);
}

export function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** 점에서 사각형까지의 최단 거리 (안에 있으면 0) */
export function distToBox(p: Point, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * 사각형 안을 격자로 샘플링한다. 모서리와 변 위의 점을 반드시 포함해
 * "실의 각 부분" 중 가장 먼 지점을 놓치지 않게 한다.
 */
export function samplePoints(b: Box, step: number): Point[] {
  const nx = Math.max(1, Math.ceil(b.w / step));
  const ny = Math.max(1, Math.ceil(b.h / step));
  const pts: Point[] = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      pts.push({ x: b.x + (b.w * i) / nx, y: b.y + (b.h * j) / ny });
    }
  }
  return pts;
}

/** 포함하는 실 중 가장 작은 실 (중첩된 실을 구분) */
export function roomAt(p: Point, rooms: Detection[], tol = 0): Detection | null {
  let best: Detection | null = null;
  for (const r of rooms) {
    if (contains(r.box, p, tol) && (!best || area(r.box) < area(best.box))) best = r;
  }
  return best;
}

/** 도면상 위치를 사람이 읽는 말로 (도면 위쪽을 북쪽으로 단정하지 않는다) */
export function describePosition(p: Point, b: Box): string {
  const fx = (p.x - b.x) / Math.max(b.w, 1);
  const fy = (p.y - b.y) / Math.max(b.h, 1);
  const h = fx < 0.34 ? "좌측" : fx > 0.66 ? "우측" : "가운데";
  const v = fy < 0.34 ? "상단" : fy > 0.66 ? "하단" : "중앙";
  if (h === "가운데" && v === "중앙") return "도면상 중앙부";
  if (h === "가운데") return `도면상 ${v}`;
  if (v === "중앙") return `도면상 ${h}`;
  return `도면상 ${h} ${v}`;
}

export interface DoorGraph {
  doors: Detection[];
  /** door id → 인접한 실 id 목록 */
  doorRooms: Map<string, string[]>;
  /** room id → 그 실에 붙은 door id 목록 */
  roomDoors: Map<string, string[]>;
  /** 외부로 통하는 출입문 id (건물 외곽선에 닿고 실 하나에만 붙은 문) */
  exteriorDoorIds: Set<string>;
}

/**
 * 실과 출입문으로 보행 경로 그래프를 만든다.
 * 문 박스가 실 박스(허용 오차만큼 확장)와 겹치면 그 실에 붙은 문으로 본다.
 */
export function buildDoorGraph(rooms: Detection[], doors: Detection[], tolPx: number): DoorGraph {
  const doorRooms = new Map<string, string[]>();
  const roomDoors = new Map<string, string[]>();
  for (const r of rooms) roomDoors.set(r.id, []);
  for (const d of doors) {
    const adj = rooms.filter((r) => intersects(expand(r.box, tolPx), d.box)).map((r) => r.id);
    doorRooms.set(d.id, adj);
    for (const rid of adj) roomDoors.get(rid)!.push(d.id);
  }
  const envelope = union(rooms.map((r) => r.box));
  const exteriorDoorIds = new Set<string>();
  if (envelope) {
    const inner = expand(envelope, -tolPx * 1.5);
    for (const d of doors) {
      const adj = doorRooms.get(d.id) ?? [];
      const c = center(d.box);
      const onEdge = !contains(inner, c);
      if (adj.length <= 1 && onEdge) exteriorDoorIds.add(d.id);
    }
  }
  return { doors, doorRooms, roomDoors, exteriorDoorIds };
}

export interface WalkField {
  /** 점에서 가장 가까운 목표까지의 보행거리(px). 경로가 없으면 Infinity */
  distanceFrom(p: Point): { distance: number; approximate: boolean };
}

/**
 * 여러 목표 지점(소화기, 계단 출입구 등)까지의 보행거리 필드.
 * 실 내부는 직선으로 이동한다고 보고, 실 사이는 출입문을 거쳐야 한다.
 * 실에 속하지 않은 목표는 직선거리로 근사하고 approximate=true로 표시한다.
 */
export function buildWalkField(
  rooms: Detection[],
  graph: DoorGraph,
  targets: Point[],
  tolPx: number,
): WalkField {
  const doorCenter = new Map(graph.doors.map((d) => [d.id, center(d.box)]));
  const distTo = new Map<string, number>();
  for (const d of graph.doors) distTo.set(d.id, Infinity);

  const targetsByRoom = new Map<string, Point[]>();
  const looseTargets: Point[] = [];
  for (const t of targets) {
    const r = roomAt(t, rooms, tolPx);
    if (!r) {
      looseTargets.push(t);
      continue;
    }
    if (!targetsByRoom.has(r.id)) targetsByRoom.set(r.id, []);
    targetsByRoom.get(r.id)!.push(t);
    for (const did of graph.roomDoors.get(r.id) ?? []) {
      const dd = dist(t, doorCenter.get(did)!);
      if (dd < distTo.get(did)!) distTo.set(did, dd);
    }
  }

  // 다익스트라: 같은 실에 붙은 문끼리 직선으로 연결
  const visited = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, v] of distTo) {
      if (!visited.has(id) && v < best) {
        best = v;
        cur = id;
      }
    }
    if (cur === null) break;
    visited.add(cur);
    const c = doorCenter.get(cur)!;
    for (const rid of graph.doorRooms.get(cur) ?? []) {
      for (const nid of graph.roomDoors.get(rid) ?? []) {
        if (nid === cur || visited.has(nid)) continue;
        const nd = best + dist(c, doorCenter.get(nid)!);
        if (nd < distTo.get(nid)!) distTo.set(nid, nd);
      }
    }
  }

  return {
    distanceFrom(p: Point) {
      let d = Infinity;
      let approximate = false;
      const r = roomAt(p, rooms, tolPx);
      if (r) {
        for (const t of targetsByRoom.get(r.id) ?? []) d = Math.min(d, dist(p, t));
        for (const did of graph.roomDoors.get(r.id) ?? []) {
          const v = distTo.get(did)!;
          if (v < Infinity) d = Math.min(d, dist(p, doorCenter.get(did)!) + v);
        }
      }
      for (const t of looseTargets) {
        const v = dist(p, t);
        if (v < d) {
          d = v;
          approximate = true;
        }
      }
      if (!r && d === Infinity) {
        for (const ts of targetsByRoom.values()) for (const t of ts) d = Math.min(d, dist(p, t));
        approximate = d < Infinity;
      }
      return { distance: d, approximate };
    },
  };
}
