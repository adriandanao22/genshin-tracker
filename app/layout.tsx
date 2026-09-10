import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StarfieldBackdrop } from "./components/starfield";

// Headings: Bricolage Grotesque (characterful display grotesque).
const fredoka = Bricolage_Grotesque({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

// Body: Inter (clean, legible workhorse).
const quicksand = Inter({
  variable: "--font-quicksand",
  subsets: ["latin"],
});

// Data / HUD numerals: JetBrains Mono (Observatory-console feel).
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orbital Atlas",
  description:
    "Track your Genshin Impact characters, builds, and daily farming routine.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${quicksand.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <StarfieldBackdrop />
        {children}
      </body>
    </html>
  );
}
