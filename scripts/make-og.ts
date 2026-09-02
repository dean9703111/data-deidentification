// Renders public/og.png (1200×630) from an inline HTML template with the local Chrome.
// Run: npm run og
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const html = `<!doctype html>
<html lang="zh-Hant-TW"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif; color: #eef2ff;
    background: radial-gradient(1200px 700px at 85% 20%, #3b7cf6 0%, #1e40af 45%, #0f1f4d 100%); position: relative; }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px); background-size: 40px 40px; mask-image: linear-gradient(180deg, rgba(0,0,0,.9), transparent 85%); }
  .wrap { position: relative; display: grid; grid-template-columns: 1.2fr 1fr; gap: 36px; padding: 56px 64px 56px; height: 100%; }
  .kicker { display: inline-flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 700; color: #dbeafe; letter-spacing: .04em; }
  .kicker .dot { width: 14px; height: 14px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 5px rgba(74,222,128,.25); }
  h1 { font-size: 62px; line-height: 1.15; white-space: nowrap; font-weight: 800; margin-top: 18px; letter-spacing: .01em; }
  h1 small { display: block; font-size: 31px; font-weight: 600; color: #c7d2fe; margin-top: 14px; letter-spacing: .02em; white-space: normal; }
  .chips { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
  .chip { padding: 11px 24px; border-radius: 999px; background: rgba(255,255,255,.16); border: 1.5px solid rgba(255,255,255,.4); font-size: 27px; font-weight: 700; }
  .url { position: absolute; left: 64px; bottom: 40px; font-size: 26px; font-weight: 600; color: #dbeafe; letter-spacing: .02em; }
  .card { align-self: center; background: #fff; color: #1f2430; border-radius: 18px; padding: 26px 26px; box-shadow: 0 30px 80px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.25); transform: rotate(-2deg); }
  .card .title { font-size: 24px; font-weight: 800; text-align: center; margin-bottom: 18px; letter-spacing: .1em; }
  .row { font-size: 20px; line-height: 2; white-space: nowrap; }
  .m { padding: 1px 8px; border-radius: 6px; font-weight: 600; }
  .n { background: #ffe0b2; } .i { background: #ffcdd2; } .p { background: #c8e6c9; } .a { background: #bbdefb; } .e { background: #e1bee7; } .c { background: #d7ccc8; } .t { background: #b2ebf2; }
  .legend { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; font-size: 15px; color: #4b5563; }
  .legend span { padding: 2px 9px; border-radius: 5px; }
  .stamp { position: absolute; right: 64px; bottom: 40px; display: flex; align-items: center; gap: 10px; font-size: 24px; color: #dbeafe; }
  .stamp b { color: #fff; }
</style></head>
<body>
<div class="grid"></div>
<div class="wrap">
  <div>
    <div class="kicker"><span class="dot"></span>純前端・資料不出電腦・可還原</div>
    <h1>文件去識別化工具<small>個資自動偵測、遮罩預覽、一鍵還原</small></h1>
    <div class="chips"><span class="chip">PDF</span><span class="chip">Word</span><span class="chip">Excel</span><span class="chip">TXT</span><span class="chip">Markdown</span><span class="chip">貼上文字</span></div>
  </div>
  <div class="card">
    <div class="title">委外服務契約書</div>
    <div class="row">甲方：<span class="m c">築夢**股份有限公司</span>（統編 <span class="m t">20*****3</span>）</div>
    <div class="row">代表人：<span class="m n">范OO</span>　手機 <span class="m p">0917-***-491</span></div>
    <div class="row">乙方：<span class="m n">方OO</span>（身分證 <span class="m i">L28******7</span>）</div>
    <div class="row">地址：<span class="m a">新北市板橋區***</span></div>
    <div class="row">電子郵件 <span class="m e">su***@mail.example.org</span></div>
    <div class="legend"><span class="n">姓名</span><span class="i">身分證</span><span class="p">手機</span><span class="a">地址</span><span class="e">Email</span><span class="c">公司</span><span class="t">統編</span></div>
  </div>
</div>
<div class="url">deanlin.net/data-deidentification</div>
<div class="stamp">by <b>Dean Lin</b> · MIT</div>
</body></html>`;

mkdirSync('public', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.screenshot({ path: 'public/og.png', type: 'png' });
await browser.close();
console.log('saved public/og.png');
