import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ObjectKind } from "@/lib/domain/catalog";
import type { BuildingInfo, Detection, Sheet } from "@/lib/domain/types";
import { reviewProject } from "@/lib/engine/review";
import { project } from "./helpers";

interface Truth {
  id: string;
  floorLabel: string;
  level: number;
  width: number;
  height: number;
  pxPerMeter: number;
  building: Omit<BuildingInfo, "confirmed">;
  expectedFindings: { ruleId: string; room?: string; kind?: ObjectKind; type: string }[];
  objects: { id: string; kind: ObjectKind; box: Detection["box"]; label?: string }[];
}

const load = (id: string): Truth =>
  JSON.parse(fs.readFileSync(path.resolve("public/samples", `${id}.truth.json`), "utf8"));

function toSheet(t: Truth): Sheet {
  return {
    id: t.id,
    projectId: "p1",
    name: `${t.id}.png`,
    kind: "floor_plan",
    floorLabel: t.floorLabel,
    level: t.level,
    imageKey: t.id,
    width: t.width,
    height: t.height,
    createdAt: "2026-11-07T00:00:00Z",
    scale: { pxPerMeter: t.pxPerMeter, confirmed: true, method: "sample", ratioText: "1:100", estimates: [], calibration: null },
    quality: { width: t.width, height: t.height, dpi: 300, sharpness: null, issues: [] },
    analysis: { status: "done", source: "sample" },
    detections: t.objects.map((o) => ({ id: o.id, kind: o.kind, box: o.box, confidence: 1, source: "sample", label: o.label })),
  };
}

describe("합성 샘플 도면 정답으로 엔진 검증", () => {
  const t3 = load("seongsu-3f");
  const t1 = load("seongsu-1f");
  const p = project({ building: { ...t3.building, confirmed: true } });

  it("3층: 심어 둔 위반 3건과 확인 필요 2건만 나온다", () => {
    const r = reviewProject(p, [toSheet(t3)]);
    const got = r.findings.filter((f) => f.type === "violation" || f.type === "check");
    for (const e of t3.expectedFindings) {
      expect(got.some((f) => f.ruleId === e.ruleId && f.type === e.type && f.roomName === e.room), `${e.ruleId} ${e.room}`).toBe(true);
    }
    expect(got.map((f) => `${f.ruleId}:${f.roomName}`).sort()).toEqual(
      t3.expectedFindings.map((e) => `${e.ruleId}:${e.room}`).sort(),
    );
    const sp = r.findings.find((f) => f.ruleId === "SP-RADIUS")!;
    expect(parseFloat(sp.measured!)).toBeCloseTo(4.0, 0);
  });

  it("3층만 올리면 수신기 누락 의심, 1층을 함께 올리면 '다른 층에 있음'", () => {
    const only3 = reviewProject(p, [toSheet(t3)]);
    expect(only3.findings.some((f) => f.type === "missing" && f.targetKinds.includes("fire_receiver"))).toBe(true);
    const both = reviewProject(p, [toSheet(t1), toSheet(t3)]);
    expect(both.findings.some((f) => f.targetKinds.includes("fire_receiver"))).toBe(false);
    const tally3 = both.sheets.find((s) => s.sheetId === t3.id)!.tallies.find((x) => x.kind === "fire_receiver")!;
    expect(tally3.status).toBe("elsewhere");
  });

  it("1층: 감지기 레이어가 빠져 연기감지기 '없음, 설치 필요'가 나온다 (PRD 시나리오 1)", () => {
    const r = reviewProject(p, [toSheet(t1), toSheet(t3)]);
    const missing = r.findings.filter((f) => f.type === "missing");
    expect(missing.map((f) => `${f.floorLabel}:${f.targetKinds[0]}`)).toEqual(["1층:smoke_detector"]);
    const tally = r.sheets.find((s) => s.sheetId === t1.id)!.tallies.find((x) => x.kind === "smoke_detector")!;
    expect(tally.status).toBe("missing_required");
    // 감지기가 없으니 실별 감지기 확인 지적은 만들지 않는다 (누락 의심 1건으로 묶음)
    expect(r.findings.some((f) => f.sheetId === t1.id && f.ruleId === "DET-ROOM")).toBe(false);
  });

  it("집계: 3층 스프링클러 헤드 52개, 옥외소화전은 설치 대상 아님", () => {
    const r = reviewProject(p, [toSheet(t3)]);
    const tallies = r.sheets[0].tallies;
    expect(tallies.find((x) => x.kind === "sprinkler_head")?.count).toBe(52);
    expect(tallies.find((x) => x.kind === "outdoor_hydrant")?.status).toBe("missing_not_required");
    expect(tallies.find((x) => x.kind === "indoor_hydrant")).toMatchObject({ count: 1, required: true });
  });
});
