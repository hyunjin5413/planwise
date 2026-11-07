import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSheet, type VisionDeps } from "@/lib/ai/analyze";
import { validateGrounding, type GuideRequest } from "@/lib/ai/guide";
import type { Overview } from "@/lib/ai/schemas";
import type { ObjectKind } from "@/lib/domain/catalog";
import type { Box } from "@/lib/domain/types";
import { center, dist, union } from "@/lib/engine/geometry";

interface Truth {
  id: string;
  floorLabel: string;
  level: number;
  pxPerMeter: number;
  legendBox: Box;
  objects: { kind: ObjectKind | "room"; box: Box; label?: string }[];
}

const truth: Truth = JSON.parse(fs.readFileSync(path.resolve("public/samples/seongsu-3f.truth.json"), "utf8"));
const image = fs.readFileSync(path.resolve("public/samples/seongsu-3f.png"));
const usage = { inputTokens: 100, outputTokens: 50 };
const px = (b: Box, f: number, ox = 0, oy = 0) => ({ x1: (b.x - ox) * f, y1: (b.y - oy) * f, x2: (b.x + b.w - ox) * f, y2: (b.y + b.h - oy) * f });

/** 정답을 그대로 돌려주는 가짜 비전 모델. dimensionValueMm로 치수선 오독을 흉내 낸다 */
function fakeVision(dimensionValueMm = 30000): VisionDeps & { tileCalls: Box[] } {
  const rooms = truth.objects.filter((o) => o.kind === "room");
  const env = union(rooms.map((r) => r.box))!;
  const tileCalls: Box[] = [];
  return {
    tileCalls,
    async overview(img, { scale: f }) {
      expect(img.width * img.height).toBeLessThanOrEqual(3_600_000);
      const data: Overview = {
        sheet_kind: "floor_plan",
        floor_label: truth.floorLabel,
        floor_level: truth.level,
        title: "3층 소방설비 평면도",
        scale_text: "1/100",
        paper_size: "A3",
        drawing_area: px({ x: env.x - 200, y: env.y - 400, w: env.w + 400, h: env.h + 600 }, f),
        legend_area: px(truth.legendBox, f),
        title_block_area: null,
        dimension: { value_mm: dimensionValueMm, x1: env.x * f, y1: (env.y - 140) * f, x2: (env.x + env.w) * f, y2: (env.y - 140) * f },
        rooms: rooms.map((r) => ({ name: r.label!, box: px(r.box, f), area_m2: null })),
        legend_entries: [{ meaning: "소화기", symbol: "사각형 안에 소", kind: "extinguisher" }],
        building_hints: { use: "근린생활시설", floor_area_m2: null, total_area_m2: null, above_ground_floors: null, basement_floors: null, notes: [] },
        tilt_degrees: 0,
        quality_notes: [],
      };
      return { data, model: "fake", usage };
    },
    async tile(img, { region, scale: tf }) {
      tileCalls.push(region);
      expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(2576);
      const inTile = truth.objects.filter((o) => {
        if (o.kind === "room") return false;
        const c = center(o.box);
        return c.x >= region.x && c.x <= region.x + region.w && c.y >= region.y && c.y <= region.y + region.h;
      });
      return {
        data: { objects: inTile.map((o) => ({ kind: o.kind as Exclude<ObjectKind, "room">, box: px(o.box, tf, region.x, region.y), confidence: 0.9 })) },
        model: "fake",
        usage,
      };
    },
  };
}

describe("분석 파이프라인 (가짜 비전 모델)", () => {
  it("타일로 나눠 찾은 객체를 원본 좌표로 되돌리고, 겹침 구간 중복을 하나로 합친다", async () => {
    const vision = fakeVision();
    const out = await analyzeSheet({ image }, vision);
    expect(vision.tileCalls.length).toBeGreaterThanOrEqual(4);

    const expected = truth.objects;
    const counts = (list: { kind: string }[]) => list.reduce<Record<string, number>>((m, o) => ((m[o.kind] = (m[o.kind] ?? 0) + 1), m), {});
    expect(counts(out.detections)).toEqual(counts(expected));

    // 모든 정답 객체가 5px 이내로 대응된다
    for (const o of expected) {
      const hit = out.detections.find((d) => d.kind === o.kind && dist(center(d.box), center(o.box)) < 5);
      expect(hit, `${o.kind} @ ${JSON.stringify(o.box)}`).toBeTruthy();
    }
    expect(out.sheet).toMatchObject({ kind: "floor_plan", floorLabel: "3층", level: 3 });
    expect(out.usage.inputTokens).toBe(100 * (1 + vision.tileCalls.length));
  });

  it("표제란 축척(1/100, A3)과 치수선이 일치하면 보정 불필요", async () => {
    const out = await analyzeSheet({ image }, fakeVision());
    const tb = out.scale.estimates.find((e) => e.method === "title_block")!;
    const dm = out.scale.estimates.find((e) => e.method === "dimension")!;
    expect(tb.pxPerMeter).toBeCloseTo(truth.pxPerMeter, 0);
    expect(Math.abs(dm.pxPerMeter - truth.pxPerMeter) / truth.pxPerMeter).toBeLessThan(0.01);
    expect(out.scale.needsCalibration).toBe(false);
    expect(out.quality.dpi).toBe(300);
    expect(out.quality.issues).toEqual([]);
  });

  it("치수선을 잘못 읽어 10% 넘게 어긋나면 두 점 보정을 요청한다", async () => {
    const out = await analyzeSheet({ image }, fakeVision(34000));
    expect(out.scale.needsCalibration).toBe(true);
    expect(out.scale.note).toContain("보정");
  });
});

describe("가이드 근거 검증", () => {
  const req: GuideRequest = {
    title: "스프링클러 헤드 수평거리 초과",
    typeLabel: "위반 의심",
    floorLabel: "3층",
    roomName: "회의실",
    content: "회의실 도면상 좌측 상단 모서리에서 가장 가까운 스프링클러 헤드까지 수평거리가 4.0m로, 내화구조 기준 2.3m를 넘습니다.",
    measured: "4.0m",
    criterion: "2.3m 이하 (내화구조)",
    templateGuide: "헤드 1개를 추가하거나 배치 간격을 조정하십시오.",
    citation: { law: "스프링클러설비의 화재안전기술기준", short: "NFTC 103", article: "2.7.3, 2.7.3.2", title: "수평거리 2.1m 이하, 내화구조 2.3m 이하" },
    standardDate: "2026-11-07",
    facts: { measuredM: 4, limitM: 2.3 },
  };
  it("근거에 있는 수치만 쓰면 통과", () => {
    const text = "3층 회의실 모서리의 수평거리가 4.0m로 2.3m를 넘으므로 헤드 1개를 추가하십시오. 근거: 스프링클러설비의 화재안전기술기준(NFTC 103) 2.7.3, 기준일 2026-11-07 시행 조문.";
    expect(validateGrounding(text, req).ok).toBe(true);
  });
  it("근거에 없는 수치(예: 헤드 간격 3.2m)를 만들면 거부", () => {
    const text = "헤드 간격을 3.2m 이하로 줄이십시오. 근거: NFTC 103 2.7.3, 기준일 2026-11-07 시행 조문.";
    const r = validateGrounding(text, req);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("3.2");
  });
});
