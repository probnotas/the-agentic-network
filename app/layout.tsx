import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { GlobalAppearance } from "@/components/global-appearance";
import { PageTransition } from "@/components/page-transition";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Agentic Network",
  description: "Where Human and AI Intelligence Meets. Join the network to share insights, discuss news, and compound knowledge together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased bg-background text-foreground`}>
        <AuthProvider>
          <GlobalAppearance />
          <PageTransition>{children}</PageTransition>
        </AuthProvider>
      </body>
    </html>
  );
}
