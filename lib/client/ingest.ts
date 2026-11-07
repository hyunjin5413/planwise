"use client";

/** 업로드 파일을 도면 이미지(페이지) 목록으로 바꾼다. PDF는 페이지별 래스터 변환 (PRD FR-01) */

export interface IngestedPage {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  /** 알 수 있으면 dpi (PDF는 렌더링 해상도) */
  dpi: number | null;
}

export const ACCEPT = ".png,.jpg,.jpeg,.tif,.tiff,.pdf,image/png,image/jpeg,image/tiff,application/pdf";

/** PDF 렌더링 dpi: 300dpi를 기본으로 하되 긴 변이 7,000px을 넘지 않게 낮춘다 (A1 이상 대형 도면) */
const PDF_TARGET_DPI = 300;
const PDF_MAX_EDGE = 7000;

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

async function pdfPages(file: File, onProgress?: (msg: string) => void): Promise<IngestedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const base = file.name.replace(/\.pdf$/i, "");
  const out: IngestedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.(`${file.name} ${i}/${doc.numPages}쪽 변환 중`);
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 }); // 1 unit = 1/72 inch
    const longIn = Math.max(v1.width, v1.height) / 72;
    const dpi = Math.min(PDF_TARGET_DPI, Math.floor(PDF_MAX_EDGE / longIn));
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PDF 렌더링 실패"))), "image/png"));
    out.push({ name: doc.numPages > 1 ? `${base} p.${i}` : base, blob, width: canvas.width, height: canvas.height, dpi });
    page.cleanup();
  }
  await task.destroy();
  return out;
}

async function tiffToPng(file: File): Promise<IngestedPage> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/convert", { method: "POST", body: form });
  if (!res.ok) throw new Error(`${file.name}: TIFF 변환에 실패했습니다.`);
  const blob = await res.blob();
  const dpiHeader = Number(res.headers.get("X-Image-Dpi"));
  const { width, height } = await imageSize(blob);
  return { name: file.name.replace(/\.tiff?$/i, ""), blob, width, height, dpi: dpiHeader > 72 ? dpiHeader : null };
}

export async function ingestFile(file: File, onProgress?: (msg: string) => void): Promise<IngestedPage[]> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return pdfPages(file, onProgress);
  if (file.type === "image/tiff" || /\.tiff?$/.test(name)) return [await tiffToPng(file)];
  if (/^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/.test(name)) {
    const { width, height } = await imageSize(file);
    return [{ name: file.name.replace(/\.(png|jpe?g)$/i, ""), blob: file, width, height, dpi: null }];
  }
  throw new Error(`${file.name}: 지원하지 않는 형식입니다. PNG, JPG, TIFF, PDF를 올려 주세요.`);
}
