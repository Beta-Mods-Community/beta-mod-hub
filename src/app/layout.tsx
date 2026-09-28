import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/footer";
import Header from "@/components/header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Beta Mods",
  title: {
    default: "Beta Mods",
    template: "%s · Beta Mods",
  },
  description:
    "Pre-release mod hosting for the Nexus community — test WIP builds, file structured bug reports, and promote to Nexus when ready.",
  keywords: [
    "mod testing",
    "beta mods",
    "Nexus Mods",
    "game mods",
    "release testing",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Header />
        <div id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
