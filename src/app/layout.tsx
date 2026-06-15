import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Track-a-EV — Conversational Tesla Tracker",
  description:
    "Tell the assistant what Tesla you want. It watches inventory every hour and pings you to approve the buy the moment one matches.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0f1a]/70 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/20 text-sky-300">⚡</span>
              Track-a-EV
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
                Assistant
              </Link>
              <Link href="/dashboard" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
                Dashboard
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
