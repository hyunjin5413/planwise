// 샘플 프로젝트로 대시보드 전체 흐름을 실행하고 단계별 스크린샷을 남긴다.
// 사용: node scripts/e2e/sample-flow.mjs <baseUrl> <outDir>
import fs from "node:fs";
import { chromium } from "playwright-core";

const [base = "http://localhost:3000", out = "e2e-out"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW ?? 1600), height: Number(process.env.VH ?? 1000) }, reducedMotion: "reduce", locale: "ko-KR" });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 400)));
page.on("pageerror", (e) => errors.push(String(e).slice(0, 400)));
page.on("dialog", (d) => d.accept());
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
};
const step = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `${out}/fail-${label}.png` });
    throw e;
  }
};

await step("open", async () => {
  await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "샘플 프로젝트로 체험하기" }).click();
  await page.waitForURL(/\/dashboard\/projects\//, { timeout: 30000 });
  await page.getByText("축척", { exact: false }).first().waitFor();
});
await shot("01-scale");

await step("scale", async () => {
  await page.getByRole("button", { name: "추정 축척으로 확정" }).click();
  await page.getByRole("button", { name: /같은 크기 도면 1장에 같은 축척 적용/ }).click();
  await page.getByRole("button", { name: "다음: 건물 정보" }).click();
  await page.getByRole("heading", { name: "설치 대상 판정" }).waitFor();
});
await shot("02-building");

await step("building", async () => {
  await page.getByRole("button", { name: "이 정보로 확인하고 검토" }).click();
  await page.getByRole("tab", { name: /지적 사항/ }).waitFor();
});
await shot("03-results");

await step("finding", async () => {
  await page.locator("li button[aria-expanded]").first().click();
  await page.waitForTimeout(400);
});
await shot("04-finding-focus");

await step("tally", async () => {
  await page.getByRole("tab", { name: "종류별 집계" }).click();
  await page.getByRole("button", { name: "전체" }).click();
});
await shot("05-tally-total");

await step("highlight", async () => {
  await page.getByRole("button", { name: "층" }).first().click().catch(() => {});
  await page.getByRole("button", { name: /스프링클러 헤드/ }).first().click();
  await page.getByRole("button", { name: "다음" }).click();
});
await shot("06-highlight-cycle");

await step("edit", async () => {
  // 사무실 B에 소화기를 추가하면 EXT-ROOM 지적이 사라져야 한다
  const tabs = page.getByRole("tab", { name: /지적 사항/ });
  const before = await tabs.textContent();
  await page.getByRole("tab", { name: "3층" }).click();
  await page.getByLabel("추가할 종류").selectOption("extinguisher");
  await page.getByRole("button", { name: "맞춤" }).click();
  await page.getByRole("button", { name: "박스 추가" }).click();
  const viewer = page.getByRole("application");
  const vb = await viewer.boundingBox();
  // 화면 맞춤 상태에서 사무실 B 안쪽 지점을 계산: 도면 좌표 → 화면 좌표
  const pt = await page.evaluate(() => {
    const el = document.querySelector('[role="application"] > div');
    const m = el.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
    return { tx: +m[1], ty: +m[2], s: +m[3] };
  });
  const toScreen = (x, y) => ({ x: vb.x + pt.tx + x * pt.s, y: vb.y + pt.ty + y * pt.s });
  // 사무실 B: 18~26m, 0~8m → 도면 원점 (28mm,52mm), 1m = 118.11px
  const ppm = 118.11;
  const ox = 28 * 11.812;
  const oy = 52 * 11.812;
  const a = toScreen(ox + 25 * ppm, oy + 7 * ppm);
  const b = toScreen(ox + 25.4 * ppm, oy + 7.5 * ppm);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "박스 추가 중" }).click();
  await page.waitForTimeout(300);
  const after = await tabs.textContent();
  console.log("findings tab before/after:", before, "→", after);
  if (before === after) throw new Error("박스를 추가했는데 지적 수가 그대로입니다");
});
await shot("07-after-edit");

await step("report", async () => {
  await page.getByRole("link", { name: "리포트 내보내기" }).click();
  await page.getByRole("button", { name: "PDF로 저장 (인쇄)" }).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/08-report.png` });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${out}/report.pdf`, preferCSSPageSize: true, printBackground: true });
  const pdf = fs.readFileSync(`${out}/report.pdf`, "latin1");
  console.log("report.pdf pages:", (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length, "bytes:", pdf.length);
});

console.log(errors.length ? `console errors (${errors.length}):\n${errors.join("\n---\n")}` : "no console errors");
await browser.close();
