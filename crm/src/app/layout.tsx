import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Training in Data — Apprenticeship CRM",
  description:
    "Student recruitment and UK Government-funded apprenticeship CRM for Training in Data. GDPR-compliant, encrypted at rest, with DAS, line manager, progress, anomaly and dropout tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className={`${poppins.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
