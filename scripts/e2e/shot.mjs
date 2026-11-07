// 로컬 Chrome으로 페이지를 열어 스크린샷을 찍는다. 콘솔 오류도 함께 출력한다.
// 사용: node scripts/e2e/shot.mjs <url> <out.png> [width] [height]
import { chromium } from "playwright-core";

const [url, out, w = "1440", h = "900"] = process.argv.slice(2);
const executablePath = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, reducedMotion: "reduce" });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: false });
console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
