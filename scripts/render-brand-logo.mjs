import pw from 'playwright'
const { chromium } = pw

// The Fleetworks brand mark is a WORDMARK, not a glyph — packages/ui/src/Logo.tsx
// renders the text "Fleetworks" at weight 600, letter-spacing -0.01em, in
// --fw-font-sans. This reproduces exactly that, rather than inventing an icon.
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const INK = '#0b0f14' // --fw-color-ink
const PAPER = '#ffffff'

const page = async (browser, { color, scale = 3 }) => {
  const p = await browser.newPage({ viewport: { width: 560, height: 160 }, deviceScaleFactor: scale })
  await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div id="m" style="
      display:inline-block;
      font-family:${FONT};
      font-weight:600;
      letter-spacing:-0.01em;
      font-size:88px;
      line-height:1;
      color:${color};
      padding:24px 28px;
    ">Fleetworks</div></body></html>`)
  return p
}

const browser = await chromium.launch({ headless: true })
for (const [name, color] of [
  ['logo-light', INK], // shown on the light theme's paper background
  ['logo-dark', PAPER], // shown on the dark theme
]) {
  const p = await page(browser, { color })
  const el = await p.$('#m')
  await el.screenshot({ path: `new URL(`../infra/brand/${name}.png`, import.meta.url).pathname`, omitBackground: true })
  const box = await el.boundingBox()
  console.log(`${name}.png  ${Math.round(box.width)}x${Math.round(box.height)} css px @3x`)
  await p.close()
}
await browser.close()
