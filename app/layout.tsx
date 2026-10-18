import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "JARVIS — Your unfair advantage",
  icons: { icon: "/icon.svg" },
  description:
    "Din intelligenta plattform för affärsmöjligheter, marknadsanalys och tillväxt.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
