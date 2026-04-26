import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Inflation Calculator — India",
  description:
    "Estimate your household's personal inflation by reweighting official Indian CPI components (base 2024=100) with your own spending mix.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
