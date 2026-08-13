import { chromium } from "playwright"

const BASE = "http://localhost:3000"
const errors = []
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1512, height: 950 } })
const p = await ctx.newPage()
p.on("console", (m) => { if (m.type() === "error") errors.push(`KONSOLE ${p.url()}: ${m.text()}`) })
p.on("pageerror", (e) => errors.push(`SEITENFEHLER ${p.url()}: ${e.message}`))
p.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`) })

const routes = ["/dashboard","/scooters","/inbound","/inspection","/refurbishment","/import","/sales","/integrations","/activity","/settings"]
for (const r of routes) {
  await p.goto(BASE + r, { waitUntil: "networkidle" })
  await p.waitForTimeout(500)
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (overflow) errors.push(`ÜBERLAUF 1512px auf ${r}`)
  const skel = await p.locator('[class*="animate-pulse"]').count()
  if (skel > 0) errors.push(`SKELETON HÄNGT auf ${r} (${skel})`)
}

// 404-Seite
await p.goto(BASE + "/gibtesnicht", { waitUntil: "networkidle" })
const has404 = await p.getByText("Diese Seite gibt es nicht").isVisible()
if (!has404) errors.push("404-Seite fehlt")

// Mobil
const m = await b.newContext({ viewport: { width: 390, height: 844 } })
const mp = await m.newPage()
mp.on("pageerror", (e) => errors.push(`MOBIL SEITENFEHLER: ${e.message}`))
for (const r of ["/dashboard","/scooters","/settings"]) {
  await mp.goto(BASE + r, { waitUntil: "networkidle" })
  await mp.waitForTimeout(400)
  if (await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) errors.push(`ÜBERLAUF 390px auf ${r}`)
}
// Drawer mit Escape schließen
await mp.goto(BASE + "/dashboard", { waitUntil: "networkidle" })
await mp.getByRole("button", { name: "Navigation öffnen" }).click()
await mp.waitForTimeout(400)
const dialog = mp.getByRole("dialog", { name: "Navigation" })
if (!(await dialog.isVisible())) errors.push("Drawer nicht als Dialog erreichbar")
await mp.keyboard.press("Escape")
await mp.waitForTimeout(400)
if (await dialog.isVisible().catch(() => false)) errors.push("Drawer schließt nicht mit Escape")

console.log(errors.length ? errors.join("\n") : "KEINE FEHLER")
await b.close()
