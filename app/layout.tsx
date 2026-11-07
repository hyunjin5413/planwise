import type { Metadata } from "next";
import { Noto_Sans_KR, Poppins } from "next/font/google";
import "./globals.css";

// 영문·숫자는 Poppins, 한글은 Noto Sans KR로 표시한다.
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  preload: false,
});

export const metadata: Metadata = {
  title: "PlanWise | AI 소방 도면 검토",
  description:
    "도면을 올리면 AI가 소방법 적합 여부를 검토하고, 고쳐야 할 부분과 근거 조항을 안내합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${poppins.variable} ${notoSansKr.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
