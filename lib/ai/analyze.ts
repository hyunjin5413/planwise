import sharp, { type Sharp } from "sharp";
import type { ObjectKind } from "@/lib/domain/catalog";
import { OBJECT_CATALOG, roomUseFromName } from "@/lib/domain/catalog";
import type { Box, BuildingHints, Detection, QualityIssue, ScaleEstimate, SheetKind, SheetQuality } from "@/lib/domain/types";
import { area, center, dist, iou } from "@/lib/engine/geometry";
import { callStructured, DETECT_EFFORT, imageBlock, textBlock, type CallResult } from "./claude";
import { OVERVIEW_SYSTEM, OVERVIEW_USER, TILE_USER, tileSystem } from "./prompts";
import { OverviewSchema, TileSchema, type Overview, type PixelBox, type TileResult } from "./schemas";

/** 모델에 보내는 이미지 한도: 긴 변 2576px, 약 3.75MP. 여유를 두고 3.6MP로 맞춘다 */
const MAX_EDGE = 2576;
const MAX_PIXELS = 3_600_000;
/** 타일 본체 크기와 겹침 (원본 픽셀) */
const TILE_CORE = 1650;
const TILE_OVERLAP = 100;
const TILE_CONCURRENCY = 4;

const PAPER_MM: Record<string, [number, number]> = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
};

export interface AnalyzeInput {
  image: Buffer;
  /** 클라이언트가 알고 있는 dpi (PDF 렌더링 시 등) */
  dpi?: number | null;
}

export interface AnalyzeOutput {
  sheet: { kind: SheetKind; floorLabel: string | null; level: number | null; title: string | null };
  scale: {
    ratioText: string | null;
    estimates: ScaleEstimate[];
    pxPerMeter: number | null;
    /** 추정값 간 차이가 10%를 넘거나 추정값이 없어 사용자 보정이 필요한지 */
    needsCalibration: boolean;
    note: string;
  };
  quality: SheetQuality;
  legendBox: Box | null;
  detections: Detection[];
  hints: BuildingHints;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  tiles: number;
}

const toBox = (b: PixelBox, f = 1, ox = 0, oy = 0): Box => {
  const x1 = Math.min(b.x1, b.x2) / f + ox;
  const y1 = Math.min(b.y1, b.y2) / f + oy;
  const x2 = Math.max(b.x1, b.x2) / f + ox;
  const y2 = Math.max(b.y1, b.y2) / f + oy;
  return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
};

function clampBox(b: Box, W: number, H: number): Box | null {
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  const x2 = Math.min(W, b.x + b.w);
  const y2 = Math.min(H, b.y + b.h);
  if (x2 - x < 2 || y2 - y < 2) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

function pad(b: Box, p: number, W: number, H: number): Box {
  return clampBox({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p }, W, H) ?? b;
}

export interface EncodedImage {
  data: Buffer;
  mediaType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

async function encode(img: Sharp): Promise<EncodedImage> {
  const { data: png, info } = await img.clone().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  if (png.length < 3_500_000) return { data: png, mediaType: "image/png", width: info.width, height: info.height };
  const jpg = await img.clone().jpeg({ quality: 88 }).toBuffer();
  return { data: jpg, mediaType: "image/jpeg", width: info.width, height: info.height };
}

/**
 * 비전 모델 호출부. 테스트에서는 정답 데이터를 돌려주는 가짜로 바꿔
 * 좌표 변환, 타일 분할, 중복 병합, 축척 추정 로직을 API 없이 검증한다.
 */
export interface VisionDeps {
  /** scale: 원본 대비 축소 비율 */
  overview(img: EncodedImage, ctx: { scale: number }): Promise<CallResult<Overview>>;
  /** region: 원본에서 잘라낸 영역, scale: 그 영역의 축소 비율 */
  tile(
    img: EncodedImage,
    ctx: { region: Box; scale: number; legendText: string; legendImage: EncodedImage | null },
  ): Promise<CallResult<TileResult>>;
}

export const claudeVision: VisionDeps = {
  overview: (img) =>
    callStructured({
      system: OVERVIEW_SYSTEM,
      content: [imageBlock(img.data, img.mediaType), textBlock(OVERVIEW_USER)],
      schema: OverviewSchema,
      effort: DETECT_EFFORT,
      maxTokens: 32000,
    }),
  tile: (img, ctx) =>
    callStructured({
      system: tileSystem(ctx.legendText),
      content: [
        ...(ctx.legendImage ? [textBlock("범례 이미지:"), imageBlock(ctx.legendImage.data, ctx.legendImage.mediaType)] : []),
        textBlock("분석할 타일:"),
        imageBlock(img.data, img.mediaType),
        textBlock(TILE_USER),
      ],
      schema: TileSchema,
      effort: DETECT_EFFORT,
      maxTokens: 32000,
    }),
};

/** 라플라시안 분산으로 선명도를 잰다. 긴 변 1600px로 줄여 비교 가능하게 한다 */
async function sharpness(image: Buffer): Promise<number> {
  const { data } = await sharp(image)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sq = 0;
  for (const v of data) {
    sum += v;
    sq += v * v;
  }
  const n = data.length;
  const mean = sum / n;
  return Math.round(sq / n - mean * mean);
}

function parseRatio(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(/\s/g, "").match(/1[:/]([\d,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return n >= 1 && n <= 5000 ? n : null;
}

function paperPxPerMm(paper: string | null, W: number, H: number): number | null {
  const key = paper?.toUpperCase().match(/A[0-4]/)?.[0];
  if (!key) return null;
  const [a, b] = PAPER_MM[key];
  const [pw, ph] = W >= H ? [a, b] : [b, a];
  // 이미지가 용지 전체일 때만 사용 (가로세로 비 3% 이내)
  if (Math.abs(W / H - pw / ph) / (pw / ph) > 0.03) return null;
  return W / pw;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

interface Raw {
  kind: ObjectKind;
  box: Box;
  confidence: number;
  /** 타일 경계에 걸려 잘렸을 가능성 */
  edge: boolean;
}

/** 타일 겹침 영역에서 같은 객체가 두 번 잡힌 것을 하나로 합친다 */
function mergeDuplicates(items: Raw[]): Raw[] {
  const sorted = [...items].sort((a, b) => Number(a.edge) - Number(b.edge) || b.confidence - a.confidence);
  const kept: Raw[] = [];
  for (const it of sorted) {
    const dup = kept.find((k) => {
      if (k.kind !== it.kind) return false;
      if (iou(k.box, it.box) > 0.25) return true;
      const s = Math.min(Math.max(k.box.w, k.box.h), Math.max(it.box.w, it.box.h));
      return dist(center(k.box), center(it.box)) < s * 0.6;
    });
    if (!dup) kept.push(it);
  }
  return kept;
}

let idSeq = 0;
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

export async function analyzeSheet(input: AnalyzeInput, vision: VisionDeps = claudeVision): Promise<AnalyzeOutput> {
  const started = Date.now();
  const base = sharp(input.image, { limitInputPixels: 400_000_000 }).rotate();
  const meta = await base.metadata();
  const W = meta.autoOrient?.width ?? meta.width!;
  const H = meta.autoOrient?.height ?? meta.height!;
  const full = await base.clone().flatten({ background: "#ffffff" }).png().toBuffer();
  const metaDpi = meta.density && meta.density > 72 ? meta.density : null;
  const usage = { inputTokens: 0, outputTokens: 0 };
  let model = "";
  const track = <T>(r: CallResult<T>) => {
    usage.inputTokens += r.usage.inputTokens;
    usage.outputTokens += r.usage.outputTokens;
    model = r.model;
    return r.data;
  };

  // 1) 전체 축소본으로 도면 개요 분석
  const f = Math.min(1, MAX_EDGE / Math.max(W, H), Math.sqrt(MAX_PIXELS / (W * H)));
  const ov = await encode(sharp(full).resize(Math.round(W * f), Math.round(H * f)));
  const [overview, sharpScore] = await Promise.all([vision.overview(ov, { scale: f }).then(track), sharpness(full)]);
  const o: Overview = overview;

  const drawing = o.drawing_area ? clampBox(toBox(o.drawing_area, f), W, H) : null;
  const legendBox = o.legend_area ? clampBox(toBox(o.legend_area, f), W, H) : null;

  // 2) 축척 추정
  const ratio = parseRatio(o.scale_text);
  const estimates: ScaleEstimate[] = [];
  const dpi = input.dpi ?? metaDpi;
  const pxPerMm = dpi ? dpi / 25.4 : paperPxPerMm(o.paper_size, W, H);
  if (ratio && pxPerMm) {
    estimates.push({
      method: "title_block",
      pxPerMeter: (pxPerMm * 1000) / ratio,
      note: `표제란 축척 ${o.scale_text}, ${dpi ? `${Math.round(dpi)}dpi` : `${o.paper_size} 용지`} 기준`,
    });
  }
  if (o.dimension && o.dimension.value_mm > 0) {
    const d = o.dimension;
    const lenPx = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / f;
    if (lenPx > 50) {
      estimates.push({
        method: "dimension",
        pxPerMeter: lenPx / (d.value_mm / 1000),
        note: `치수선 ${d.value_mm.toLocaleString("ko-KR")}mm = ${Math.round(lenPx).toLocaleString("ko-KR")}px`,
      });
    }
  }
  let pxPerMeter: number | null = null;
  let needsCalibration = true;
  let scaleNote = "축척을 추정하지 못했습니다. 길이를 아는 두 점으로 보정하십시오.";
  const tb = estimates.find((e) => e.method === "title_block");
  const dm = estimates.find((e) => e.method === "dimension");
  if (tb && dm) {
    const diff = Math.abs(tb.pxPerMeter - dm.pxPerMeter) / tb.pxPerMeter;
    pxPerMeter = tb.pxPerMeter;
    needsCalibration = diff > 0.1;
    scaleNote = needsCalibration
      ? `표제란 축척과 치수선 추정이 ${(diff * 100).toFixed(0)}% 차이 납니다. 두 점 보정이 필요합니다.`
      : `표제란 축척과 치수선 추정이 ${(diff * 100).toFixed(1)}% 이내로 일치합니다.`;
  } else if (tb || dm) {
    pxPerMeter = (tb ?? dm)!.pxPerMeter;
    scaleNote = "추정값이 하나뿐이라 교차 검증하지 못했습니다. 확인하거나 두 점으로 보정하십시오.";
  }

  // 3) 품질 검사
  const issues: QualityIssue[] = [];
  const effDpi = dpi ?? (pxPerMm ? pxPerMm * 25.4 : null);
  if (effDpi != null && effDpi < 150)
    issues.push({ code: "very_low_resolution", severity: "error", message: `해상도가 약 ${Math.round(effDpi)}dpi로 150dpi 미만입니다. 거리 판정을 보류하고 재업로드를 권장합니다.` });
  else if (effDpi != null && effDpi < 290)
    issues.push({ code: "low_resolution", severity: "warn", message: `해상도가 약 ${Math.round(effDpi)}dpi입니다. 300dpi 이상을 권장합니다.` });
  else if (effDpi == null && Math.max(W, H) < 3000)
    issues.push({ code: "low_resolution", severity: "warn", message: `긴 변이 ${Math.max(W, H)}px입니다. A3 기준 약 5,000px(300dpi) 이상을 권장합니다.` });
  if (sharpScore < 150) issues.push({ code: "blurry", severity: "warn", message: "이미지가 흐립니다. 작은 심볼을 놓칠 수 있습니다." });
  if (o.tilt_degrees != null && Math.abs(o.tilt_degrees) > 1)
    issues.push({ code: "skewed", severity: "warn", message: `도면이 약 ${Math.abs(o.tilt_degrees).toFixed(1)}° 기울어져 있습니다. 반듯하게 스캔한 파일을 권장합니다.` });
  for (const note of o.quality_notes) if (/잘림|잘려|cut|crop/i.test(note)) issues.push({ code: "cropped", severity: "warn", message: note });
  if (W * H > 40_000_000) issues.push({ code: "large_image", severity: "info", message: "대형 도면이라 여러 타일로 나눠 분석합니다." });

  const hints: BuildingHints = {
    use: o.building_hints.use,
    floorLabel: o.floor_label,
    floorArea: o.building_hints.floor_area_m2,
    totalArea: o.building_hints.total_area_m2,
    aboveGroundFloors: o.building_hints.above_ground_floors,
    basementFloors: o.building_hints.basement_floors,
    notes: o.building_hints.notes,
  };

  const sheetOut = { kind: o.sheet_kind, floorLabel: o.floor_label, level: o.floor_level, title: o.title };
  const quality: SheetQuality = { width: W, height: H, dpi: effDpi ? Math.round(effDpi) : null, sharpness: sharpScore, issues };
  const scale = { ratioText: o.scale_text, estimates, pxPerMeter, needsCalibration, note: scaleNote };

  // 평면도가 아니면 분류만 하고 끝낸다 (PRD: MVP는 평면도만 판정)
  if (o.sheet_kind !== "floor_plan") {
    return { sheet: sheetOut, scale, quality, legendBox, detections: [], hints, model, usage, durationMs: Date.now() - started, tiles: 0 };
  }

  // 4) 실: 개요 분석 결과를 원본 좌표로
  const detections: Detection[] = [];
  for (const r of o.rooms) {
    const b = clampBox(toBox(r.box, f), W, H);
    if (!b) continue;
    if (drawing && !(center(b).x >= drawing.x && center(b).x <= drawing.x + drawing.w && center(b).y >= drawing.y && center(b).y <= drawing.y + drawing.h)) continue;
    const name = r.name.trim();
    detections.push({ id: newId("room"), kind: "room", box: b, confidence: name.endsWith("(추정)") ? 0.45 : 0.85, source: "ai", label: name.replace(/\s*\(추정\)$/, ""), roomUse: roomUseFromName(name) });
  }

  // 5) 원본 해상도 타일에서 심볼·문·계단·창호 인식
  const region = drawing ? pad(drawing, Math.round(Math.max(W, H) * 0.01), W, H) : { x: 0, y: 0, w: W, h: H };
  const nx = Math.max(1, Math.ceil(region.w / TILE_CORE));
  const ny = Math.max(1, Math.ceil(region.h / TILE_CORE));
  const cw = Math.ceil(region.w / nx);
  const ch = Math.ceil(region.h / ny);
  const tiles: Box[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const t = clampBox({ x: region.x + i * cw - TILE_OVERLAP, y: region.y + j * ch - TILE_OVERLAP, w: cw + 2 * TILE_OVERLAP, h: ch + 2 * TILE_OVERLAP }, W, H);
      if (t) tiles.push(t);
    }

  const legendText =
    o.legend_entries.length > 0
      ? o.legend_entries.map((e) => `- ${e.symbol} → ${e.meaning}${e.kind ? ` (kind: ${e.kind})` : " (인식 대상 아님)"}`).join("\n")
      : "범례 없음. 한국 소방 도시기호 관례로 판단한다.";
  let legendImage: EncodedImage | null = null;
  if (legendBox) {
    const lb = pad(legendBox, 10, W, H);
    legendImage = await encode(
      sharp(full).extract({ left: lb.x, top: lb.y, width: lb.w, height: lb.h }).resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }),
    );
  }

  const raws = await pool(tiles, TILE_CONCURRENCY, async (t) => {
    let img = sharp(full).extract({ left: t.x, top: t.y, width: t.w, height: t.h });
    const tf = Math.min(1, MAX_EDGE / Math.max(t.w, t.h), Math.sqrt(MAX_PIXELS / (t.w * t.h)));
    if (tf < 1) img = img.resize(Math.round(t.w * tf), Math.round(t.h * tf));
    const enc = await encode(img);
    const res = track(await vision.tile(enc, { region: t, scale: tf, legendText, legendImage }));
    const tw = t.w * tf;
    const th = t.h * tf;
    const margin = 6;
    return res.objects.map((ob): Raw | null => {
      const b = clampBox(toBox(ob.box, tf, t.x, t.y), W, H);
      if (!b) return null;
      const touches = ob.box.x1 <= margin || ob.box.y1 <= margin || ob.box.x2 >= tw - margin || ob.box.y2 >= th - margin;
      return { kind: ob.kind, box: b, confidence: Math.max(0, Math.min(1, ob.confidence)), edge: touches };
    });
  });

  // 심볼은 실제 크기 기준으로 말이 안 되게 큰 박스를 걸러낸다
  const maxSymbolPx = pxPerMeter ? pxPerMeter * 3 : Math.max(W, H) * 0.06;
  const flat = raws.flat().filter((r): r is Raw => {
    if (!r) return false;
    if (OBJECT_CATALOG[r.kind].facility && r.kind !== "fire_receiver" && r.kind !== "indoor_hydrant") {
      if (Math.max(r.box.w, r.box.h) > maxSymbolPx) return false;
    }
    if (legendBox && OBJECT_CATALOG[r.kind].facility) {
      const c = center(r.box);
      if (c.x >= legendBox.x && c.x <= legendBox.x + legendBox.w && c.y >= legendBox.y && c.y <= legendBox.y + legendBox.h) return false;
    }
    return area(r.box) > 4;
  });
  for (const r of mergeDuplicates(flat)) {
    detections.push({ id: newId(r.kind), kind: r.kind, box: r.box, confidence: Number(r.confidence.toFixed(2)), source: "ai" });
  }

  return { sheet: sheetOut, scale, quality, legendBox, detections, hints, model, usage, durationMs: Date.now() - started, tiles: tiles.length };
}
