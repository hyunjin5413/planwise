/** 받침에 따라 조사를 고른다. 영문·숫자로 끝나는 이름(사무실 B, 계단실1)도 읽는 소리로 판단한다. */

const BATCHIM_ALNUM = new Set(["0", "1", "3", "6", "7", "8", "l", "m", "n", "r"]);
const RIEUL_ALNUM = new Set(["1", "7", "8", "l", "r"]);

function lastSound(word: string): { batchim: boolean; rieul: boolean } {
  const chars = [...word.replace(/\s*\([^)]*\)\s*$/, "").trim()];
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const jong = (code - 0xac00) % 28;
      return { batchim: jong !== 0, rieul: jong === 8 };
    }
    const lower = ch.toLowerCase();
    if (/[a-z0-9]/.test(lower)) return { batchim: BATCHIM_ALNUM.has(lower), rieul: RIEUL_ALNUM.has(lower) };
  }
  return { batchim: false, rieul: false };
}

export type JosaPair = "은/는" | "이/가" | "을/를" | "과/와" | "으로/로";

export function josa(word: string, pair: JosaPair): string {
  const { batchim, rieul } = lastSound(word);
  const [a, b] = pair.split("/");
  if (pair === "으로/로") return batchim && !rieul ? a : b;
  return batchim ? a : b;
}

/** 단어 + 조사 */
export function jo(word: string, pair: JosaPair): string {
  return word + josa(word, pair);
}
