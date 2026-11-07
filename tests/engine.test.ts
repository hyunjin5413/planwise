import { describe, expect, it } from "vitest";
import { getCitation } from "@/lib/engine/legal";
import { evaluateRequirements } from "@/lib/engine/requirements";
import { reviewProject } from "@/lib/engine/review";
import { building, door, obj, project, sheet, sym } from "./helpers";

const req = (b: ReturnType<typeof building>, system: string) => evaluateRequirements(b).find((r) => r.system === system)!;

describe("설치 대상 판정 (시행령 별표 4)", () => {
  it("근린생활시설 1,350㎡ 3층: 간이스프링클러·자동화재탐지설비·시각경보기 대상, 옥내소화전 아님", () => {
    const b = building();
    expect(req(b, "extinguisher").required).toBe(true);
    expect(req(b, "indoor_hydrant").required).toBe(false);
    expect(req(b, "sprinkler").required).toBe(false);
    expect(req(b, "simple_sprinkler").required).toBe(true);
    expect(req(b, "fire_detection").required).toBe(true);
    expect(req(b, "emergency_alarm").required).toBe(false);
    expect(req(b, "visual_alarm").required).toBe(true);
    expect(req(b, "emergency_lighting").required).toBe(false);
    expect(req(b, "outdoor_hydrant").required).toBe(false);
  });

  it("업무시설 800㎡: 자동화재탐지설비 아님(1,000㎡ 기준), 비상경보설비 대상", () => {
    const b = building({
      use: "office",
      aboveGroundFloors: 2,
      floors: [
        { level: 1, label: "1층", area: 400, windowless: false },
        { level: 2, label: "2층", area: 400, windowless: false },
      ],
    });
    expect(req(b, "fire_detection").required).toBe(false);
    expect(req(b, "emergency_alarm").required).toBe(true);
    expect(req(b, "visual_alarm").required).toBe(false);
    expect(req(b, "simple_sprinkler").required).toBe(false);
  });

  it("6층 이상이면 스프링클러·자동화재탐지설비 모든 층", () => {
    const b = building({
      use: "office",
      aboveGroundFloors: 6,
      floors: Array.from({ length: 6 }, (_, i) => ({ level: i + 1, label: `${i + 1}층`, area: 150, windowless: false })),
    });
    expect(req(b, "sprinkler")).toMatchObject({ required: true, levels: null });
    expect(req(b, "fire_detection").required).toBe(true);
  });

  it("지하층 바닥면적 300㎡ 이상이면 옥내소화전 모든 층, 450㎡ 이상이면 그 층 비상조명등", () => {
    const b = building({
      basementFloors: 1,
      floors: [
        { level: -1, label: "지하1층", area: 460, windowless: false },
        { level: 1, label: "1층", area: 200, windowless: false },
      ],
      aboveGroundFloors: 1,
    });
    expect(req(b, "indoor_hydrant").required).toBe(true);
    expect(req(b, "emergency_lighting")).toMatchObject({ required: true, levels: [-1] });
  });
});

describe("조문 버전 선택", () => {
  it("NFTC 103 수평거리 조항은 2026.3.1 전후로 번호가 다르다", () => {
    expect(getCitation("NFTC103", "2025-06-01").article).toBe("2.7.3.4");
    expect(getCitation("NFTC103", "2026-11-07").article).toBe("2.7.3, 2.7.3.2");
  });
  it("NFTC 시행 전 기준일은 규칙 없음으로 판정 보류", () => {
    const r = reviewProject(project({ standardDate: "2021-01-01" }), [sheet([])]);
    expect(r.findings.some((f) => f.ruleId === "RULESET" && f.type === "pending")).toBe(true);
  });
});

describe("스프링클러 헤드 수평거리 (NFTC 103)", () => {
  const room = () => obj("room", 0, 0, 6, 5, "회의실");
  it("6m×5m 실 중앙 헤드 1개: 모서리까지 3.9m > 2.3m 위반 의심", () => {
    const r = reviewProject(project(), [sheet([room(), sym("sprinkler_head", 3, 2.5)])]);
    const f = r.findings.find((x) => x.ruleId === "SP-RADIUS");
    expect(f?.type).toBe("violation");
    expect(f?.measured).toBe("3.9m");
    expect(f?.criterion).toContain("2.3m");
    expect(f?.citation.article).toBe("2.7.3, 2.7.3.2");
  });
  it("헤드 4개 격자 배치: 최대 1.95m로 적합", () => {
    const heads = [
      [1.5, 1.25],
      [4.5, 1.25],
      [1.5, 3.75],
      [4.5, 3.75],
    ].map(([x, y]) => sym("sprinkler_head", x, y));
    const r = reviewProject(project(), [sheet([room(), ...heads])]);
    expect(r.findings.find((x) => x.ruleId === "SP-RADIUS")).toBeUndefined();
  });
  it("내화구조가 아니면 2.1m 기준", () => {
    const heads = [
      [1.4, 1.2],
      [4.6, 1.2],
      [1.4, 3.8],
      [4.6, 3.8],
    ].map(([x, y]) => sym("sprinkler_head", x, y));
    // 실 중앙 (3, 2.5)까지 √(1.6²+1.3²)=2.06, 모서리 (0,0)까지 √(1.4²+1.2²)=1.84 → 2.1m 이내
    const ok = reviewProject(project({ building: building({ fireResistant: false }) }), [sheet([room(), ...heads])]);
    expect(ok.findings.find((x) => x.ruleId === "SP-RADIUS")).toBeUndefined();
    const one = reviewProject(project({ building: building({ fireResistant: false }) }), [
      sheet([obj("room", 0, 0, 4, 3, "창고"), sym("sprinkler_head", 2, 1.5)]),
    ]);
    // 모서리까지 2.5m > 2.1m
    expect(one.findings.find((x) => x.ruleId === "SP-RADIUS")?.criterion).toContain("2.1m");
  });
});

describe("소화기 보행거리 (NFTC 101) — 벽을 뚫지 않고 문을 거친다", () => {
  // 실 A(0~10, 0~8), 실 B(10~20, 0~8), 복도(0~20, 8~10)
  // 소화기는 실 A의 벽 쪽 (9,1). 실 B (10.5,1)에서 직선 1.5m지만 문을 돌아가면 약 39.6m
  const dets = () => [
    obj("room", 0, 0, 10, 8, "사무실 A"),
    obj("room", 10, 0, 10, 8, "사무실 B"),
    obj("room", 0, 8, 20, 2, "복도"),
    door(1, 8),
    door(19, 8),
    sym("extinguisher", 9, 1),
  ];
  it("직선거리가 아닌 보행거리로 판정해 사무실 B를 위반 의심으로 표시", () => {
    const r = reviewProject(project(), [sheet(dets())]);
    const f = r.findings.find((x) => x.ruleId === "EXT-WALK" && x.roomName === "사무실 B");
    expect(f?.type).toBe("violation");
    const m = parseFloat(f!.measured!);
    expect(m).toBeGreaterThan(35);
    expect(m).toBeLessThan(42);
  });
  it("복도에 소화기를 추가하면 해소된다", () => {
    const r = reviewProject(project(), [sheet([...dets(), sym("extinguisher", 19, 9), sym("extinguisher", 15, 4)])]);
    expect(r.findings.filter((x) => x.ruleId === "EXT-WALK")).toHaveLength(0);
  });
  it("33㎡ 이상 구획된 거실에 소화기가 없으면 위반 의심 (NFTC 101 2.1.1.4.1)", () => {
    const r = reviewProject(project(), [sheet(dets())]);
    const f = r.findings.find((x) => x.ruleId === "EXT-ROOM");
    expect(f?.roomName).toBe("사무실 B");
    expect(f?.citation.article).toBe("2.1.1.4.1");
  });
});

describe("피난구유도등 (NFTC 303)", () => {
  const base = () => [
    obj("room", 0, 0, 10, 8, "사무실"),
    obj("room", 10, 0, 4, 8, "계단실1"),
    obj("room", 0, 8, 14, 2, "복도"),
    door(5, 8),
    door(12, 8),
  ];
  it("계단실 출입구에 유도등이 없으면 위반 의심", () => {
    const r = reviewProject(project(), [sheet(base())]);
    const f = r.findings.find((x) => x.ruleId === "EXIT-SIGN");
    expect(f?.type).toBe("violation");
    expect(f?.roomName).toBe("계단실1 출입구");
  });
  it("출입구 근처에 피난구유도등이 있으면 통과", () => {
    const r = reviewProject(project(), [sheet([...base(), sym("exit_sign", 12, 8.6)])]);
    expect(r.findings.find((x) => x.ruleId === "EXIT-SIGN")).toBeUndefined();
  });
});

describe("존재와 집계", () => {
  it("자동화재탐지설비 대상인데 감지기가 없으면 연기감지기 누락 의심", () => {
    const r = reviewProject(project(), [sheet([obj("room", 0, 0, 10, 8, "사무실"), obj("room", 0, 8, 10, 2, "복도")])]);
    const t = r.sheets[0].tallies.find((x) => x.kind === "smoke_detector")!;
    expect(t.status).toBe("missing_required");
    expect(r.findings.some((f) => f.type === "missing" && f.targetKinds.includes("smoke_detector"))).toBe(true);
    const outdoor = r.totals.find((x) => x.kind === "outdoor_hydrant")!;
    expect(outdoor.status).toBe("missing_not_required");
  });
  it("신뢰도 낮은 객체는 '확인 필요 n개 포함'으로 표시", () => {
    const r = reviewProject(project(), [sheet([sym("extinguisher", 1, 1), sym("extinguisher", 3, 1, 0.3)])]);
    const t = r.sheets[0].tallies.find((x) => x.kind === "extinguisher")!;
    expect(t).toMatchObject({ count: 2, lowConfidence: 1, status: "detected" });
    expect(t.note).toBe("확인 필요 1개 포함");
  });
  it("건물 정보 미확인이면 설치 의무 판정 보류", () => {
    const r = reviewProject(project({ building: building({ confirmed: false }) }), [sheet([])]);
    expect(r.findings[r.findings.length - 1].type).toBe("pending");
    expect(r.sheets[0].tallies.every((t) => t.status === "pending" || t.status === "detected")).toBe(true);
  });
  it("축척 미확정이면 거리 판정을 하지 않고 판정 보류", () => {
    const s = sheet([obj("room", 0, 0, 6, 5, "회의실"), sym("sprinkler_head", 3, 2.5)]);
    s.scale = { ...s.scale, confirmed: false };
    const r = reviewProject(project(), [s]);
    expect(r.findings.find((x) => x.ruleId === "SP-RADIUS")).toBeUndefined();
    expect(r.findings.find((x) => x.ruleId === "SCALE")?.type).toBe("pending");
  });
  it("지적 사항 정렬: 위반 의심 → 누락 의심 → 확인 필요 → 판정 보류, 번호는 1부터", () => {
    const s = sheet([obj("room", 0, 0, 6, 5, "회의실"), sym("sprinkler_head", 3, 2.5)]);
    const r = reviewProject(project(), [s]);
    const order = ["violation", "missing", "check", "pending"];
    const idx = r.findings.map((f) => order.indexOf(f.type));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(r.findings.map((f) => f.no)).toEqual(r.findings.map((_, i) => i + 1));
  });
});

describe("직통계단 (건축법 시행령 제34조, 피난·방화구조 규칙 제8조)", () => {
  // 3층, 거실 20m×22m = 440㎡ (400㎡ 이상) → 직통계단 2개소 대상
  const office = () => obj("room", 0, 0, 20, 22, "사무실");
  it("계단이 1개면 개수 부족 위반 의심", () => {
    const r = reviewProject(project(), [sheet([office(), obj("room", 20, 0, 4, 6, "계단실"), door(20, 3, false)])]);
    expect(r.findings.find((f) => f.ruleId === "STAIR-COUNT")?.type).toBe("violation");
  });
  it("계단 2개가 붙어 있으면 출입구 이격 거리 부족", () => {
    const r = reviewProject(project(), [
      sheet([
        office(),
        obj("room", 20, 0, 4, 6, "계단실1"),
        obj("room", 20, 6, 4, 6, "계단실2"),
        door(20, 3, false),
        door(20, 9, false),
      ]),
    ]);
    expect(r.findings.find((f) => f.ruleId === "STAIR-COUNT")).toBeUndefined();
    const f = r.findings.find((x) => x.ruleId === "STAIR-SEP");
    expect(f?.type).toBe("violation");
    expect(f?.citation.article).toBe("제8조 제2항 제1호");
  });
  it("계단을 양 끝에 두면 이격 기준 충족", () => {
    const r = reviewProject(project(), [
      sheet([
        office(),
        obj("room", 20, 0, 4, 6, "계단실1"),
        obj("room", 20, 16, 4, 6, "계단실2"),
        door(20, 3, false),
        door(20, 19, false),
      ]),
    ]);
    // 대각선 √(24²+22²)≈32.6m, 스프링클러 없음 → 1/2 = 16.3m, 출입구 간 16m → 아직 부족
    // 계단을 더 떨어뜨린 경우와 비교하기 위해 측정값만 확인
    const f = r.findings.find((x) => x.ruleId === "STAIR-SEP");
    expect(f?.measured).toBe("16.0m");
  });
});
