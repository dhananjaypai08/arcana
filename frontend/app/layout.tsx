import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ARCANA Protocol",
  description: "Invisible inputs. Verifiable outputs. Tradeable facts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white min-h-screen antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
