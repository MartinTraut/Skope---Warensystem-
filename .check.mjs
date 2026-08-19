import { chromium } from "playwright"
const routes = ["/dashboard","/inventory","/stocktake","/proposals","/teardown","/sales","/settings"]
const out = "/private/tmp/claude-501/-Users-martintraut-Dokumente-Projekte-Skope---Warensystem-/75dcd63a-b0e1-4697-b9f2-8c3bb2c5c6a2/scratchpad/shots"
const browser = await chromium.launch()
for (const w of [1512, 390]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } })
  const errors = []
  page.on("console", m => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", e => errors.push(String(e)))
  for (const r of routes) {
    await page.goto("http://localhost:3000" + r, { waitUntil: "networkidle" })
    await page.waitForTimeout(400)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    const btn = await page.evaluate(() => {
      const bs = [...document.querySelectorAll("button")].map(b => b.getBoundingClientRect().height).filter(h => h > 0)
      return { min: Math.min(...bs), max: Math.max(...bs), n: bs.length }
    })
    console.log(w, r, "overflow:", overflow, "buttons:", JSON.stringify(btn))
    if (w === 1512) await page.screenshot({ path: `${out}${r.replace(/\//g,"_")}-${w}.png` })
  }
  console.log(w, "errors:", errors.length, errors.slice(0,3))
  await page.close()
}
await browser.close()
