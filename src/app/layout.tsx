import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaseMate PI v2",
  description: "Local-first prototype for CaseMate PI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
