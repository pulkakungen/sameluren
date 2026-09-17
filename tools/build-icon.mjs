// Bygger app-ikonen ur kråkans viloläge: klipper ut huvudet och lägger det
// på marinblå botten. Kör med: node tools/build-icon.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const SRC = '/home/user/sameluren/art/crow/sitter.svg';
const svg = fs.readFileSync(SRC, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });

// hela figurens ruta, för att kunna klippa ut huvudet
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.waitForTimeout(300);
const box = await page.evaluate(() => {
  const root = document.querySelector('svg');
  const inv = root.getScreenCTM().inverse();
  const p = (x, y) => new DOMPoint(x, y).matrixTransform(inv);
  const r = root.getBoundingClientRect();
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  root.querySelectorAll('path,circle,ellipse,rect,g').forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) return;
    const a = p(b.left, b.top), c = p(b.right, b.bottom);
    x1 = Math.min(x1, a.x); y1 = Math.min(y1, a.y); x2 = Math.max(x2, c.x); y2 = Math.max(y2, c.y);
  });
  return { x1, y1, x2, y2, vb: root.getAttribute('viewBox') };
});

// huvudet sitter i övre delen, näbben sticker ut åt höger
const w = box.x2 - box.x1, h = box.y2 - box.y1;
const size = Math.min(w, h) * 0.74;
const cx = box.x1 + w * 0.585;
const cy = box.y1 + h * 0.205;
const view = [cx - size / 2, cy - size / 2, size, size].map((n) => Math.round(n));
console.log('figurruta', box, '-> ikonruta', view.join(' '));

const kropp = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

async function rita(px, path, skala) {
  const inner = size / skala;
  const v = [cx - inner / 2, cy - inner / 2, inner, inner].map((n) => Math.round(n)).join(' ');
  const html = `<body style="margin:0;width:${px}px;height:${px}px;background:#101c33">
    <svg width="${px}" height="${px}" viewBox="${v}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">${kropp}</svg>
  </body>`;
  const p2 = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  await p2.setContent(html);
  await p2.waitForTimeout(250);
  await p2.screenshot({ path, omitBackground: false });
  await p2.close();
  console.log('skrev', path);
}

// 0.78 ger luft runt huvudet, så det klarar maskable-beskärningen
await rita(512, '/home/user/sameluren/icons/icon-512.png', 0.78);
await rita(192, '/home/user/sameluren/icons/icon-192.png', 0.78);
await browser.close();
