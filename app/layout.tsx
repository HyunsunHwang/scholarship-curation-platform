import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

/** Geist는 한글 글리프가 없어 Safari에서 폴백·렌더링이 거칠어질 수 있음 → 한글 포함 Noto Sans KR을 본문 폰트로 사용 */
const notoSansKr = Noto_Sans_KR({
  // next/font 생성 타입에 korean이 누락되어 있음(실제 Google Fonts는 지원).
  subsets: ["latin", "korean"] as ("latin")[],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-noto-sans-kr",
  display: "swap",
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "장학쌤ㅣ맞춤형 장학금 추천 플랫폼",
  description:
    "복잡한 장학금 정보를 한 곳에서 확인하세요. 내 조건을 입력하면 지금 바로 신청 가능한 장학금을 안내해드립니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
