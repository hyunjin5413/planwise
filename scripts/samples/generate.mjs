// 합성 샘플 도면 생성기
// A3 가로(420×297mm), 축척 1:100, 300dpi(4961×3508px) 소방 평면도 SVG와 정답(ground truth) JSON을 만든다.
// 사용: node scripts/samples/generate.mjs  →  public/samples/<id>.svg, <id>.truth.json
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/samples");
const PAPER_W = 420;
const PAPER_H = 297;
const PX_W = 4961;
const PX_H = 3508;
const PX_PER_MM = PX_W / PAPER_W; // ≈ 11.812
const SCALE = 100; // 1:100 → 1m = 10mm
const MM_PER_M = 1000 / SCALE;
const OX = 28; // 도면 원점 (mm)
const OY = 52;

const mx = (m) => OX + m * MM_PER_M;
const my = (m) => OY + m * MM_PER_M;
const r2 = (v) => Math.round(v * 100) / 100;

function toPxBox(x, y, w, h) {
  return { x: Math.round(x * PX_PER_MM), y: Math.round(y * PX_PER_MM), w: Math.round(w * PX_PER_MM), h: Math.round(h * PX_PER_MM) };
}

// ── 심볼 (mm 단위, 중심 기준) ───────────────────────────────────────
const SYM = {
  extinguisher: { w: 3.2, h: 4.4, draw: (x, y) => `<rect x="${x - 1.6}" y="${y - 2.2}" width="3.2" height="4.4" rx="0.6" class="s"/><text x="${x}" y="${y + 1}" class="st">소</text>` },
  indoor_hydrant: {
    w: 11,
    h: 4,
    draw: (x, y) =>
      `<rect x="${x - 5.5}" y="${y - 2}" width="11" height="4" class="s"/><polygon points="${x - 5.5},${y + 2} ${x + 5.5},${y - 2} ${x + 5.5},${y + 2}" class="f"/>`,
  },
  sprinkler_head: {
    w: 2.6,
    h: 2.6,
    draw: (x, y) =>
      `<circle cx="${x}" cy="${y}" r="1.3" class="s"/><path d="M${x - 0.92} ${y - 0.92}L${x + 0.92} ${y + 0.92}M${x + 0.92} ${y - 0.92}L${x - 0.92} ${y + 0.92}" class="s"/>`,
  },
  smoke_detector: { w: 3.8, h: 3.8, draw: (x, y) => `<rect x="${x - 1.9}" y="${y - 1.9}" width="3.8" height="3.8" class="s"/><text x="${x}" y="${y + 1}" class="st">S</text>` },
  heat_detector: {
    w: 4.4,
    h: 2.4,
    draw: (x, y) => `<path d="M${x - 2.2} ${y + 1.2}A2.2 2.2 0 0 1 ${x + 2.2} ${y + 1.2}Z" class="s"/><line x1="${x - 2.2}" y1="${y + 1.2}" x2="${x + 2.2}" y2="${y + 1.2}" class="s"/>`,
  },
  manual_call_point: { w: 3.6, h: 3.6, draw: (x, y) => `<circle cx="${x}" cy="${y}" r="1.8" class="s"/><text x="${x}" y="${y + 0.95}" class="st">P</text>` },
  alarm_bell: { w: 3.6, h: 3.6, draw: (x, y) => `<circle cx="${x}" cy="${y}" r="1.8" class="s"/><text x="${x}" y="${y + 0.95}" class="st">B</text>` },
  indicator_lamp: { w: 3.6, h: 3.6, draw: (x, y) => `<circle cx="${x}" cy="${y}" r="1.8" class="s"/><text x="${x}" y="${y + 0.95}" class="st">L</text>` },
  visual_alarm: {
    w: 5,
    h: 5,
    draw: (x, y) => `<path d="M${x} ${y - 2.5}L${x + 2.5} ${y}L${x} ${y + 2.5}L${x - 2.5} ${y}Z" class="s"/><text x="${x}" y="${y + 0.95}" class="st">V</text>`,
  },
  fire_receiver: {
    w: 10,
    h: 6,
    draw: (x, y) =>
      `<rect x="${x - 5}" y="${y - 3}" width="10" height="6" class="s"/><path d="M${x - 5} ${y - 1}H${x + 5}M${x - 5} ${y + 1}H${x + 5}M${x} ${y - 3}V${y + 3}" class="s"/>`,
  },
  exit_sign: {
    w: 7,
    h: 3.4,
    draw: (x, y) => `<rect x="${x - 3.5}" y="${y - 1.7}" width="7" height="3.4" class="s"/><rect x="${x - 3.5}" y="${y - 1.7}" width="3.5" height="3.4" class="f"/>`,
  },
  corridor_guide_light: {
    w: 6.4,
    h: 2.8,
    draw: (x, y) =>
      `<rect x="${x - 3.2}" y="${y - 1.4}" width="6.4" height="2.8" class="s"/><path d="M${x - 2.3} ${y}H${x + 2.3}M${x - 2.3} ${y}l0.9 -0.7M${x - 2.3} ${y}l0.9 0.7M${x + 2.3} ${y}l-0.9 -0.7M${x + 2.3} ${y}l-0.9 0.7" class="s"/>`,
  },
  emergency_light: {
    w: 3.6,
    h: 3.6,
    draw: (x, y) => `<circle cx="${x}" cy="${y}" r="1.8" class="s"/><path d="M${x} ${y - 1.8}A1.8 1.8 0 0 0 ${x} ${y + 1.8}Z" class="f"/>`,
  },
};

const LEGEND = [
  ["extinguisher", "소화기 (분말 3.3kg)"],
  ["indoor_hydrant", "옥내소화전함"],
  ["sprinkler_head", "간이스프링클러헤드 (하향식)"],
  ["smoke_detector", "연기감지기 (광전식 2종)"],
  ["heat_detector", "열감지기 (차동식 스포트형 2종)"],
  ["manual_call_point", "발신기"],
  ["alarm_bell", "경종"],
  ["indicator_lamp", "표시등"],
  ["visual_alarm", "시각경보기"],
  ["fire_receiver", "수신기 (P형)"],
  ["exit_sign", "피난구유도등"],
  ["corridor_guide_light", "통로유도등"],
  ["emergency_light", "비상조명등"],
];

// ── 도면 구성 ─────────────────────────────────────────────────────
function grid(x0, y0, w, h, pitchMax = 3.2) {
  const nx = Math.ceil(w / pitchMax);
  const ny = Math.ceil(h / pitchMax);
  const px = w / nx;
  const py = h / ny;
  const pts = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) pts.push([r2(x0 + px * (i + 0.5)), r2(y0 + py * (j + 0.5))]);
  return pts;
}

function buildSvg(spec) {
  const truth = [];
  const parts = [];
  const add = (kind, xmm, ymm, wmm, hmm, extra = {}) => truth.push({ kind, box: toPxBox(xmm, ymm, wmm, hmm), ...extra });

  // 벽체: 실 경계를 두께 0.2m(2mm)로
  const walls = [];
  for (const r of spec.rooms) {
    const [x, y, w, h] = r.rect;
    walls.push(`<rect x="${mx(x)}" y="${my(y)}" width="${w * MM_PER_M}" height="${h * MM_PER_M}" class="wall"/>`);
  }
  parts.push(`<g>${walls.join("")}</g>`);

  // 창호
  for (const [x, y, len, vertical] of spec.windows ?? []) {
    const X = mx(x);
    const Y = my(y);
    const L = len * MM_PER_M;
    if (vertical) {
      parts.push(`<rect x="${X - 1.2}" y="${Y}" width="2.4" height="${L}" fill="#fff"/><path d="M${X - 1.2} ${Y}V${Y + L}M${X} ${Y}V${Y + L}M${X + 1.2} ${Y}V${Y + L}M${X - 1.2} ${Y}H${X + 1.2}M${X - 1.2} ${Y + L}H${X + 1.2}" class="thin"/>`);
      add("window", X - 1.2, Y, 2.4, L);
    } else {
      parts.push(`<rect x="${X}" y="${Y - 1.2}" width="${L}" height="2.4" fill="#fff"/><path d="M${X} ${Y - 1.2}H${X + L}M${X} ${Y}H${X + L}M${X} ${Y + 1.2}H${X + L}M${X} ${Y - 1.2}V${Y + 1.2}M${X + L} ${Y - 1.2}V${Y + 1.2}" class="thin"/>`);
      add("window", X, Y - 1.2, L, 2.4);
    }
  }

  // 문: [중심x, 중심y, 폭(m), 벽 방향 'h'|'v', 열림 방향 +1/-1, 양개 여부]
  for (const d of spec.doors) {
    const [cx, cy, wid, dir, swing, dbl] = d;
    const X = mx(cx);
    const Y = my(cy);
    const W = wid * MM_PER_M;
    const leaf = dbl ? W / 2 : W;
    if (dir === "h") {
      const x1 = X - W / 2;
      parts.push(`<rect x="${x1}" y="${Y - 1.3}" width="${W}" height="2.6" fill="#fff"/>`);
      const s = swing; // +1: 아래(+y)로 열림, -1: 위로
      const leaves = dbl ? [[x1, 1], [x1 + W, -1]] : [[x1, 1]];
      for (const [hx, sign] of leaves) {
        const ex = hx;
        const ey = Y + s * leaf;
        const ax = hx + sign * leaf;
        parts.push(`<line x1="${hx}" y1="${Y}" x2="${ex}" y2="${ey}" class="door"/><path d="M${ex} ${ey}A${leaf} ${leaf} 0 0 ${(s > 0) === (sign > 0) ? 0 : 1} ${ax} ${Y}" class="arc"/>`);
      }
      const by = s > 0 ? Y - 1 : Y - leaf;
      add("door", x1, by, W, leaf + 1);
    } else {
      const y1 = Y - W / 2;
      parts.push(`<rect x="${X - 1.3}" y="${y1}" width="2.6" height="${W}" fill="#fff"/>`);
      const s = swing; // +1: 오른쪽(+x)으로 열림
      const leaves = dbl ? [[y1, 1], [y1 + W, -1]] : [[y1, 1]];
      for (const [hy, sign] of leaves) {
        const ex = X + s * leaf;
        const ay = hy + sign * leaf;
        parts.push(`<line x1="${X}" y1="${hy}" x2="${ex}" y2="${hy}" class="door"/><path d="M${ex} ${hy}A${leaf} ${leaf} 0 0 ${(s > 0) === (sign > 0) ? 1 : 0} ${X} ${ay}" class="arc"/>`);
      }
      const bx = s > 0 ? X - 1 : X - leaf;
      add("door", bx, y1, leaf + 1, W);
    }
  }

  // 계단 (디딤판)
  for (const st of spec.stairs) {
    const [x, y, w, h] = st;
    const X = mx(x);
    const Y = my(y);
    const Wm = w * MM_PER_M;
    const Hm = h * MM_PER_M;
    const half = Wm / 2;
    let lines = `<rect x="${X}" y="${Y}" width="${Wm}" height="${Hm}" class="thin"/><line x1="${X + half}" y1="${Y}" x2="${X + half}" y2="${Y + Hm}" class="thin"/>`;
    for (let t = Y + 2.6; t < Y + Hm - 0.5; t += 2.6) lines += `<line x1="${X}" y1="${t}" x2="${X + Wm}" y2="${t}" class="thin"/>`;
    lines += `<path d="M${X + half / 2} ${Y + Hm - 2}V${Y + 3}l-1 2M${X + half / 2} ${Y + 3}l1 2" class="thin"/><text x="${X + half / 2}" y="${Y + Hm - 0.6}" class="tiny">UP</text>`;
    parts.push(lines);
    add("stair", X, Y, Wm, Hm);
  }

  // 실 이름과 면적
  for (const r of spec.rooms) {
    const [x, y, w, h] = r.rect;
    const [lx, ly] = r.labelAt ?? [x + w / 2, y + h / 2];
    const area = (w * h).toFixed(2);
    parts.push(`<text x="${mx(lx)}" y="${my(ly)}" class="room">${r.name}</text>`);
    if (r.showArea !== false) parts.push(`<text x="${mx(lx)}" y="${my(ly) + 4.2}" class="area">A=${area}㎡</text>`);
    add("room", mx(x), my(y), w * MM_PER_M, h * MM_PER_M, { label: r.name });
  }

  // 소방 심볼
  for (const [kind, pts] of Object.entries(spec.symbols)) {
    for (const p of pts) {
      const [x, y, rot] = p;
      const s = SYM[kind];
      const X = mx(x);
      const Y = my(y);
      const g = s.draw(X, Y);
      parts.push(rot ? `<g transform="rotate(${rot} ${X} ${Y})">${g}</g>` : g);
      if (kind === "indicator_lamp") continue; // 표시등은 인식 대상 아님 (오탐 확인용)
      const [w, h] = rot === 90 || rot === -90 ? [s.h, s.w] : [s.w, s.h];
      add(kind, X - w / 2, Y - h / 2, w, h);
    }
  }

  // 치수선
  const dims = [];
  const top = my(0) - 12;
  const left = mx(0) - 12;
  const xs = spec.dimX;
  const ys = spec.dimY;
  const span = (a, b) => ((b - a) * 1000).toLocaleString("en-US");
  dims.push(`<line x1="${mx(xs[0])}" y1="${top}" x2="${mx(xs[xs.length - 1])}" y2="${top}" class="thin"/>`);
  dims.push(`<line x1="${mx(xs[0])}" y1="${top - 7}" x2="${mx(xs[xs.length - 1])}" y2="${top - 7}" class="thin"/>`);
  dims.push(`<text x="${(mx(xs[0]) + mx(xs[xs.length - 1])) / 2}" y="${top - 8}" class="dim">${span(xs[0], xs[xs.length - 1])}</text>`);
  for (let i = 0; i < xs.length; i++) {
    dims.push(`<path d="M${mx(xs[i])} ${top - 9}V${top + 3}M${mx(xs[i]) - 1} ${top + 1}l2 -2" class="thin"/>`);
    if (i > 0) dims.push(`<text x="${(mx(xs[i - 1]) + mx(xs[i])) / 2}" y="${top - 1}" class="dim">${span(xs[i - 1], xs[i])}</text>`);
  }
  dims.push(`<line x1="${left}" y1="${my(ys[0])}" x2="${left}" y2="${my(ys[ys.length - 1])}" class="thin"/>`);
  for (let i = 0; i < ys.length; i++) {
    dims.push(`<path d="M${left - 3} ${my(ys[i])}H${left + 9}M${left - 1} ${my(ys[i]) + 1}l2 -2" class="thin"/>`);
    if (i > 0) {
      const cy = (my(ys[i - 1]) + my(ys[i])) / 2;
      dims.push(`<text x="${left - 1.5}" y="${cy}" class="dim" transform="rotate(-90 ${left - 1.5} ${cy})">${span(ys[i - 1], ys[i])}</text>`);
    }
  }
  parts.push(dims.join(""));

  // 범례
  const LX = 336;
  let LY = 22;
  const legend = [`<text x="${LX}" y="${LY}" class="h">범  례</text>`, `<rect x="${LX - 4}" y="${LY - 6}" width="80" height="${8 + LEGEND.length * 7.2}" class="thin"/>`];
  const legendTop = LY - 6;
  LY += 7;
  for (const [k, label] of LEGEND) {
    legend.push(SYM[k].draw(LX + 4, LY - 1.2));
    legend.push(`<text x="${LX + 12}" y="${LY}" class="lg">${label}</text>`);
    LY += 7.2;
  }
  parts.push(legend.join(""));
  const legendBox = toPxBox(LX - 4, legendTop, 80, 8 + LEGEND.length * 7.2);

  // 표제란
  const TB = { x: 332, y: 190, w: 80, h: 99 };
  const rows = [
    ["공 사 명", spec.project],
    ["도 면 명", spec.title],
    ["축    척", "1/100 (A3)"],
    ["도면번호", spec.number],
    ["일    자", "2026. 11."],
    ["설    계", "PlanWise 샘플"],
  ];
  const tb = [`<rect x="${TB.x}" y="${TB.y}" width="${TB.w}" height="${TB.h}" class="frame"/>`];
  let ty = TB.y;
  const rh = TB.h / rows.length;
  rows.forEach(([k, v], i) => {
    if (i > 0) tb.push(`<line x1="${TB.x}" y1="${ty}" x2="${TB.x + TB.w}" y2="${ty}" class="thin"/>`);
    tb.push(`<text x="${TB.x + 3}" y="${ty + rh / 2 + 1.2}" class="tbk">${k}</text><text x="${TB.x + 22}" y="${ty + rh / 2 + 1.2}" class="tbv">${v}</text>`);
    ty += rh;
  });
  tb.push(`<line x1="${TB.x + 19}" y1="${TB.y}" x2="${TB.x + 19}" y2="${TB.y + TB.h}" class="thin"/>`);
  parts.push(tb.join(""));

  // 도면 제목
  parts.push(`<text x="${mx(0)}" y="${my(spec.height) + 22}" class="title">${spec.title}</text><text x="${mx(0)}" y="${my(spec.height) + 29}" class="sub">SCALE : 1/100</text>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX_W}" height="${PX_H}" viewBox="0 0 ${PAPER_W} ${PAPER_H}">
<style>
  text { font-family: "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; fill: #111; }
  .wall { fill: none; stroke: #111; stroke-width: 2; }
  .thin { fill: none; stroke: #222; stroke-width: 0.25; }
  .frame { fill: none; stroke: #111; stroke-width: 0.6; }
  .door { stroke: #222; stroke-width: 0.35; }
  .arc { fill: none; stroke: #444; stroke-width: 0.25; stroke-dasharray: 0.8 0.6; }
  .s { fill: #fff; stroke: #111; stroke-width: 0.35; }
  .f { fill: #111; stroke: none; }
  .st { font-size: 2.6px; font-weight: 700; text-anchor: middle; }
  .room { font-size: 3.4px; font-weight: 700; text-anchor: middle; }
  .area { font-size: 2.4px; text-anchor: middle; fill: #444; }
  .dim { font-size: 2.6px; text-anchor: middle; }
  .tiny { font-size: 2px; text-anchor: middle; }
  .h { font-size: 4px; font-weight: 700; }
  .lg { font-size: 2.8px; }
  .tbk { font-size: 2.8px; }
  .tbv { font-size: 2.8px; font-weight: 700; }
  .title { font-size: 6px; font-weight: 700; }
  .sub { font-size: 3.2px; }
</style>
<rect x="0" y="0" width="${PAPER_W}" height="${PAPER_H}" fill="#fff"/>
<rect x="8" y="8" width="${PAPER_W - 16}" height="${PAPER_H - 16}" class="frame"/>
${parts.join("\n")}
</svg>`;

  return {
    svg,
    truth: {
      id: spec.id,
      title: spec.title,
      floorLabel: spec.floorLabel,
      level: spec.level,
      width: PX_W,
      height: PX_H,
      dpi: 300,
      ratioText: "1:100",
      pxPerMeter: r2(PX_PER_MM * MM_PER_M),
      legendBox,
      building: spec.building,
      expectedFindings: spec.expectedFindings,
      objects: truth.map((t, i) => ({ id: `${spec.id}-${t.kind}-${i}`, ...t })),
    },
  };
}

// ── 샘플 정의 (단위 m, 원점은 건물 좌상단) ───────────────────────────
const BUILDING = {
  use: "neighborhood",
  useDetail: "제2종 근린생활시설 (사무소, 점포)",
  aboveGroundFloors: 3,
  basementFloors: 0,
  floors: [
    { level: 1, label: "1층", area: 540, windowless: false },
    { level: 2, label: "2층", area: 540, windowless: false },
    { level: 3, label: "3층", area: 540, windowless: false },
  ],
  totalArea: 1620,
  fireResistant: true,
  occupants: null,
};

const corridorHeads = Array.from({ length: 8 }, (_, i) => [r2(1.875 + 3.75 * i), 9.25]);

const sample3F = {
  id: "seongsu-3f",
  title: "3층 소방설비 평면도",
  number: "FP-103",
  project: "성수동 근린생활시설 신축공사",
  floorLabel: "3층",
  level: 3,
  height: 18,
  building: BUILDING,
  rooms: [
    { name: "사무실 A", rect: [0, 0, 12, 8], labelAt: [6, 5.4] },
    { name: "회의실", rect: [12, 0, 6, 8], labelAt: [16.4, 6.6] },
    { name: "사무실 B", rect: [18, 0, 8, 8], labelAt: [22, 5.6] },
    { name: "계단실1", rect: [26, 0, 4, 8], labelAt: [28.7, 7.3], showArea: false },
    { name: "복도", rect: [0, 8, 30, 2.5], labelAt: [3.4, 9.6], showArea: false },
    { name: "계단실2", rect: [0, 10.5, 4, 7.5], labelAt: [1.7, 12.05], showArea: false },
    { name: "남자화장실", rect: [4, 10.5, 3.5, 7.5], labelAt: [5.75, 14.6] },
    { name: "여자화장실", rect: [7.5, 10.5, 3.5, 7.5], labelAt: [9.25, 14.6] },
    { name: "탕비실", rect: [11, 10.5, 3.5, 7.5], labelAt: [12.75, 15.8] },
    { name: "EPS·TPS", rect: [14.5, 10.5, 1.5, 7.5], labelAt: [15.25, 15.4], showArea: false },
    { name: "점포", rect: [16, 10.5, 14, 7.5], labelAt: [23, 15.6] },
  ],
  windows: [
    [2, 0, 4],
    [7, 0, 3],
    [13.5, 0, 3],
    [19.5, 0, 5],
    [18, 18, 4],
    [24, 18, 4],
  ],
  doors: [
    [10, 8, 0.9, "h", -1],
    [13, 8, 0.9, "h", -1],
    [19.5, 8, 0.9, "h", -1],
    [26.95, 8, 0.9, "h", -1],
    [3.1, 10.5, 0.9, "h", 1],
    [5.75, 10.5, 0.8, "h", 1],
    [9.25, 10.5, 0.8, "h", 1],
    [12.75, 10.5, 0.9, "h", 1],
    [15.25, 10.5, 0.8, "h", 1],
    [23, 10.5, 1.8, "h", 1, true],
    [0, 9.25, 1.8, "v", -1, true],
  ],
  stairs: [
    [26.4, 0.4, 3.2, 5.6],
    [0.4, 12.4, 3.2, 5.2],
  ],
  symbols: {
    extinguisher: [[6, 10.1], [24, 8.4], [0.5, 7.3], [17.5, 7.3], [29.4, 17.3], [13.9, 17.3]],
    sprinkler_head: [
      ...grid(0, 0, 12, 8),
      [15, 2.67],
      [15, 5.33],
      ...grid(18, 0, 8, 8),
      ...corridorHeads,
      ...grid(11, 10.5, 3.5, 7.5),
      ...grid(16, 10.5, 14, 7.5),
    ],
    smoke_detector: [[6, 2.67], [13.5, 4], [20.67, 2.67], [7.5, 9.25], [22.5, 9.25], [28, 1.2], [2, 17.2], [21.6, 13]],
    heat_detector: [[12.75, 13]],
    indoor_hydrant: [[15.4, 10.2]],
    manual_call_point: [[17.6, 10.05]],
    alarm_bell: [[18.1, 10.05]],
    indicator_lamp: [[18.6, 10.05]],
    visual_alarm: [[11.25, 8.35], [25.2, 8.35], [16.6, 17.5]],
    exit_sign: [[26.95, 8.4], [0.4, 9.25, 90]],
    corridor_guide_light: [[10, 10.25], [20, 10.25]],
    emergency_light: [[4, 8.4], [26, 10.2]],
  },
  dimX: [0, 12, 18, 26, 30],
  dimY: [0, 8, 10.5, 18],
  expectedFindings: [
    { ruleId: "EXT-ROOM", room: "사무실 B", type: "violation", note: "64㎡ 구획 거실에 소화기 없음" },
    { ruleId: "SP-RADIUS", room: "회의실", type: "violation", note: "헤드 2개로 모서리 수평거리 약 4.0m" },
    { ruleId: "EXIT-SIGN", room: "계단실2 출입구", type: "violation", note: "계단실2 출입구 피난구유도등 없음" },
    { ruleId: "DET-ROOM", room: "남자화장실", type: "check", note: "일반 화장실 감지기 없음" },
    { ruleId: "DET-ROOM", room: "여자화장실", type: "check", note: "일반 화장실 감지기 없음" },
  ],
};

const sample1F = {
  id: "seongsu-1f",
  title: "1층 소방설비 평면도",
  number: "FP-101",
  project: "성수동 근린생활시설 신축공사",
  floorLabel: "1층",
  level: 1,
  height: 18,
  building: BUILDING,
  rooms: [
    { name: "점포1", rect: [0, 0, 13, 8], labelAt: [6.5, 5] },
    { name: "점포2", rect: [13, 0, 13, 8], labelAt: [19.5, 5] },
    { name: "계단실1", rect: [26, 0, 4, 8], labelAt: [28.7, 7.3], showArea: false },
    { name: "홀", rect: [0, 8, 30, 2.5], labelAt: [3.4, 9.6], showArea: false },
    { name: "계단실2", rect: [0, 10.5, 4, 7.5], labelAt: [1.7, 12.05], showArea: false },
    { name: "관리실", rect: [4, 10.5, 5, 7.5], labelAt: [6.5, 15.4] },
    { name: "화장실", rect: [9, 10.5, 4, 7.5], labelAt: [11, 14.6] },
    { name: "점포3", rect: [13, 10.5, 17, 7.5], labelAt: [21.5, 15.4] },
  ],
  windows: [
    [1, 0, 3],
    [9, 0, 3],
    [14, 0, 3],
    [22, 0, 3],
    [16, 18, 5],
    [23, 18, 5],
  ],
  doors: [
    [6.5, 0, 1.8, "h", 1, true],
    [19.5, 0, 1.8, "h", 1, true],
    [10, 8, 0.9, "h", -1],
    [16, 8, 0.9, "h", -1],
    [26.95, 8, 0.9, "h", -1],
    [3.1, 10.5, 0.9, "h", 1],
    [6.5, 10.5, 0.9, "h", 1],
    [11, 10.5, 0.8, "h", 1],
    [21.5, 10.5, 1.8, "h", 1, true],
    [0, 9.25, 1.8, "v", -1, true],
  ],
  stairs: [
    [26.4, 0.4, 3.2, 5.6],
    [0.4, 12.4, 3.2, 5.2],
  ],
  symbols: {
    extinguisher: [[12.5, 7.3], [13.5, 7.3], [24, 8.4], [8.6, 17.3], [29.4, 17.3], [6, 10.1]],
    sprinkler_head: [...grid(0, 0, 13, 8), ...grid(13, 0, 13, 8), ...corridorHeads, ...grid(4, 10.5, 5, 7.5), ...grid(13, 10.5, 17, 7.5)],
    indoor_hydrant: [[15.4, 10.2]],
    manual_call_point: [[17.6, 10.05]],
    alarm_bell: [[18.1, 10.05]],
    indicator_lamp: [[18.6, 10.05]],
    fire_receiver: [[5.4, 12]],
    visual_alarm: [[11.25, 8.35], [25.2, 8.35], [8.6, 12]],
    exit_sign: [[26.95, 8.4], [3.1, 10.1], [0.4, 9.25, 90], [6.5, 0.4], [19.5, 0.4]],
    corridor_guide_light: [[10, 10.25], [20, 10.25]],
    emergency_light: [[4, 8.4]],
  },
  dimX: [0, 13, 26, 30],
  dimY: [0, 8, 10.5, 18],
  expectedFindings: [
    { ruleId: "REQ-MISSING", kind: "smoke_detector", type: "missing", note: "감지기 레이어 누락 (PRD 시나리오 1)" },
  ],
};

fs.mkdirSync(OUT, { recursive: true });
const index = [];
for (const spec of [sample3F, sample1F]) {
  const { svg, truth } = buildSvg(spec);
  fs.writeFileSync(path.join(OUT, `${spec.id}.svg`), svg);
  fs.writeFileSync(path.join(OUT, `${spec.id}.truth.json`), JSON.stringify(truth, null, 1));
  const counts = {};
  for (const o of truth.objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  index.push({ id: spec.id, title: spec.title, floorLabel: spec.floorLabel, level: spec.level, file: `${spec.id}.png`, truth: `${spec.id}.truth.json`, counts });
  console.log(spec.id, JSON.stringify(counts));
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ project: sample3F.project, building: BUILDING, samples: index }, null, 1));
