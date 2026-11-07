import sharp from "sharp";

/** 브라우저가 표시하지 못하는 형식(TIFF 등)을 PNG로 바꾼다. dpi는 헤더로 돌려준다 */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "file 필드가 없습니다." }, { status: 400 });
  try {
    const img = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 400_000_000 }).rotate();
    const meta = await img.metadata();
    const png = await img.flatten({ background: "#ffffff" }).png().toBuffer();
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "X-Image-Dpi": String(meta.density ?? "") },
    });
  } catch {
    return Response.json({ error: "이미지를 변환하지 못했습니다." }, { status: 415 });
  }
}
