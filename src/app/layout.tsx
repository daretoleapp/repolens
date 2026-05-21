import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { RepoSelector } from "@/components/repo-selector";
import { RepoProvider } from "@/components/repo-context";
import { Toaster } from "sonner";
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
  title: "RepoLens — Codebase intelligence",
  description:
    "Stop reviewing PRs blind. See risk, hotspots, and reviewer fit before you click open. Powered by Xiaomi MiMo.",
  openGraph: {
    title: "RepoLens",
    description: "AI-powered codebase intelligence — risk, hotspots, contributor fit.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RepoProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden">
              <RepoSelector />
              {children}
            </main>
          </div>
        </RepoProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "var(--background-card)",
              border: "1px solid var(--border-strong)",
              color: "var(--foreground)",
            },
          }}
        />
      </body>
    </html>
  );
}
