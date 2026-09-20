import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { robotsNoindex } from "@/lib/deployment-environment";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  const robots = robotsNoindex(process.env);
  return {
    title: APP_NAME,
    ...(robots ? { robots } : {}),
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
