import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "./providers";
import "./globals.scss";

const font = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "СубсидияЧек — проверка пакета документов", template: "%s · СубсидияЧек" },
  description: "Рабочее место специалиста: автоматическая проверка пакета документов на получение субсидии",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#21a038",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={font.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
