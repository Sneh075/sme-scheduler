import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SME Scheduling Agent",
  description: "Weekly SME-to-session matching with human-in-the-loop review",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
