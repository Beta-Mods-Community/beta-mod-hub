import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { isCloudPilot } from "@lib/pilot";
import { sitePresentation } from "@lib/site-presentation";
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
    "Browse beta mods, download test builds, and report bugs. Authors can upload versions and review feedback before release.",
  keywords: [
    "mod testing",
    "beta mods",
    "Nexus Mods",
    "game mods",
    "release testing",
  ],
  openGraph: {
    type: "website",
    siteName: sitePresentation.title,
    title: sitePresentation.title,
    description: sitePresentation.description,
    images: [{ url: sitePresentation.image, alt: "Beta Mods beta symbol" }],
  },
  twitter: {
    card: "summary",
    title: sitePresentation.title,
    description: sitePresentation.description,
    images: [sitePresentation.image],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-cloud-pilot={isCloudPilot() ? "on" : undefined}
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
