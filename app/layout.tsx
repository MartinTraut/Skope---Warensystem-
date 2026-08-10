import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "SKOPE Cockpit",
    template: "%s · SKOPE Cockpit",
  },
  description:
    "Interne Steuerzentrale für den Warenprozess gebrauchter E-Scooter — vom Wareneingang über Prüfung und Aufbereitung bis zum Verkauf.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#08090a",
  // Werkstattbetrieb am Tablet: Zoom bleibt erlaubt, nichts wird gesperrt.
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="de"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body>
        {/* Das Cockpit ist bewusst nur dunkel — kein Theme-Wechsel. */}
        <ThemeProvider forcedTheme="dark" enableSystem={false}>
          {children}
          <Toaster position="bottom-right" closeButton richColors={false} />
        </ThemeProvider>
      </body>
    </html>
  )
}
