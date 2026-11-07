// 새 프로젝트에 PDF·PNG를 올리고 (AI 없이) 수동 입력 → 두 점 축척 보정 → 건물 정보 → 결과까지 실행한다.
// 사용: node scripts/e2e/upload-flow.mjs <baseUrl> <outDir>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [base = "http://localhost:3000", out = "e2e-out"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce", locale: "ko-KR" });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("dialog", (d) => d.accept());
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` }).then(() => console.log("shot", name));

await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
await page.getByLabel("건물명").fill("업로드 테스트 근린생활시설");
await page.getByRole("button", { name: "프로젝트 만들기" }).click();
await page.waitForURL(/\/dashboard\/projects\//);

// 1) 업로드: PDF(1층) + PNG(3층)
const samples = path.resolve("public/samples");
await page.locator('input[type="file"]').setInputFiles([path.join(samples, "seongsu-1f.pdf"), path.join(samples, "seongsu-3f.png")]);
await page.getByText("올린 도면 2장").waitFor({ timeout: 60000 });
await page.waitForTimeout(800);
const cards = await page.locator("text=/[\\d,]+×[\\d,]+px/").allTextContents();
console.log("sheet sizes:", cards);
await shot("u1-uploaded");

// 층 이름 지정 (파일명에 층 정보가 없으므로)
const floorInputs = page.getByLabel("층");
await floorInputs.nth(0).fill("1층");
await floorInputs.nth(1).fill("3층");
while ((await page.getByRole("button", { name: "수동 입력" }).count()) > 0) await page.getByRole("button", { name: "수동 입력" }).first().click();
await page.getByRole("button", { name: "다음: 축척 확인" }).click();

// 2) 두 점 보정: 상단 전체 치수선(30,000mm) 양 끝을 클릭
async function calibrate(tabName) {
  await page.getByRole("button", { name: new RegExp(`^${tabName}`) }).click();
  await page.getByRole("button", { name: "두 점으로 보정" }).click();
  const viewer = page.getByRole("application");
  const vb = await viewer.boundingBox();
  const t = await page.evaluate(() => {
    const el = document.querySelector('[role="application"] > div');
    const m = el.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
    return { tx: +m[1], ty: +m[2], s: +m[3] };
  });
  const pxmm = 4961 / 420;
  const y = (52 - 12) * pxmm; // 치수선 y (mm → px)
  const x1 = 28 * pxmm;
  const x2 = (28 + 300) * pxmm;
  await page.mouse.click(vb.x + t.tx + x1 * t.s, vb.y + t.ty + y * t.s);
  await page.mouse.click(vb.x + t.tx + x2 * t.s, vb.y + t.ty + y * t.s);
  await page.getByLabel("실제 길이 (m)").fill("30");
  await page.getByRole("button", { name: "보정 적용" }).click();
  const value = await page.locator("p.text-2xl").first().textContent();
  console.log(`${tabName} calibrated:`, value);
}
await calibrate("1층");
await shot("u2-calibrated");
await calibrate("3층");
await page.getByRole("button", { name: "다음: 건물 정보" }).click();

// 3) 건물 정보
await page.getByLabel("지상 층수").fill("3");
for (const lv of ["1층", "2층", "3층"]) await page.getByLabel(`${lv} 바닥면적`).fill("540");
await shot("u3-building");
await page.getByRole("button", { name: "이 정보로 확인하고 검토" }).click();
await page.getByRole("tab", { name: /지적 사항/ }).waitFor();
await page.waitForTimeout(600);
const titles = await page.locator("li button[aria-expanded] span.text-sm.font-medium").allTextContents();
console.log("findings:", titles.length, titles.slice(0, 12));
await shot("u4-results-manual");

console.log(errors.length ? `console errors (${errors.length}):\n${errors.join("\n---\n")}` : "no console errors");
await browser.close();
