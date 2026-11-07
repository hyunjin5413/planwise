// pdf.js 워커를 public/에 복사한다. 설치된 pdfjs-dist 버전과 항상 같게 유지하려고 postinstall에서 실행한다.
import fs from "node:fs";
fs.copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
console.log("copied pdf.worker.min.mjs");
