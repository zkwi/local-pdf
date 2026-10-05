// 在 Vite 开发站用 playwright-cli run-code --filename 执行。
// 用画布现做的合成图片覆盖图片工具的处理流水线和界面主流程，不需要私有样本。
// prettier-ignore
async (page) => {
  const pipeline = await page.evaluate(async () => {
    const { processImage } = await import('/src/core/image/compress.ts');
    const { imagesToPdf } = await import('/src/core/pdfgen/images-to-pdf.ts');
    const make = async (type, w, h, draw, quality) => {
      const c = new OffscreenCanvas(w, h);
      draw(c.getContext('2d'), w, h);
      return c.convertToBlob({ type, quality });
    };
    const photo = await make('image/jpeg', 2400, 1600, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#3a6ea5');
      g.addColorStop(1, '#ee964b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `hsl(${(i * 37) % 360} 60% ${30 + (i % 50)}%)`;
        ctx.fillRect((i * 97) % w, (i * 53) % h, 14, 14);
      }
    }, 0.95);
    const logo = await make('image/png', 600, 600, (ctx) => {
      ctx.fillStyle = '#b5451b';
      ctx.beginPath();
      ctx.arc(300, 300, 220, 0, 7);
      ctx.fill();
    });
    const base = { output: 'keep', quality: 'standard', targetBytes: 0, resize: 'none', size: 1920, percent: 50, exactWidth: 500, exactHeight: 500, fit: 'cover', background: 'keep', color: '#ffffff', dpi: 0, keepUnchanged: false };
    const run = (file, options) => processImage({ file, options: { ...base, ...options }, maxPixels: 50_000_000 });
    const pixels = async (blob) => {
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return { width: bmp.width, height: bmp.height, corner: [...ctx.getImageData(0, 0, 1, 1).data] };
    };
    const compressed = await run(photo, {});
    const target = await run(photo, { targetBytes: 150 * 1024 });
    const long = await run(photo, { resize: 'long', size: 1000 });
    const toJpeg = await run(logo, { output: 'jpeg' });
    const keptPng = await run(logo, { quality: 'high' });
    const contain = await run(logo, { resize: 'exact', exactWidth: 800, exactHeight: 400, fit: 'contain' });
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="red"/></svg>'], { type: 'image/svg+xml' });
    const pdf = await imagesToPdf([{ file: new File([logo], 'a.png'), rotation: 0 }, { file: new File([svg], 'b.svg'), rotation: 0 }], { pageSize: 'fit', orientation: 'auto', margin: 'none', quality: 'auto' });
    return {
      compressed: { smaller: compressed.blob.size < photo.size, format: compressed.format },
      target: { size: target.blob.size, notes: target.notes.map((n) => n.code) },
      long: [long.width, long.height],
      jpegCorner: (await pixels(toJpeg.blob)).corner,
      keptPng: { format: keptPng.format, smaller: keptPng.blob.size <= logo.size },
      containCorner: (await pixels(contain.blob)).corner,
      pdfPages: pdf.pages,
    };
  });
  if (!pipeline.compressed.smaller || pipeline.compressed.format !== 'jpeg') throw new Error(`Compression regression: ${JSON.stringify(pipeline)}`);
  if (pipeline.target.size > 150 * 1024) throw new Error(`Target size regression: ${JSON.stringify(pipeline)}`);
  if (pipeline.long[0] !== 1000 || pipeline.long[1] !== 667) throw new Error(`Resize regression: ${JSON.stringify(pipeline)}`);
  if (pipeline.jpegCorner.slice(0, 3).some((v) => v < 250)) throw new Error(`JPEG background regression: ${JSON.stringify(pipeline)}`);
  if (pipeline.keptPng.format !== 'png' || !pipeline.keptPng.smaller) throw new Error(`PNG regression: ${JSON.stringify(pipeline)}`);
  if (pipeline.containCorner[3] !== 0) throw new Error(`Transparent padding regression: ${JSON.stringify(pipeline)}`);
  if (pipeline.pdfPages !== 2) throw new Error(`SVG to PDF regression: ${JSON.stringify(pipeline)}`);

  // 界面主流程：拖入后自动处理、结果、对比、打包
  await page.goto(`${page.url().split('/').slice(0, 3).join('/')}/compress-images?lang=en`);
  await page.waitForTimeout(500);
  const ui = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = new OffscreenCanvas(800, 600);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a6ea5';
    ctx.fillRect(0, 0, 800, 600);
    for (let i = 0; i < 800; i++) {
      ctx.fillStyle = `hsl(${i % 360} 70% 50%)`;
      ctx.fillRect((i * 37) % 800, (i * 91) % 600, 9, 9);
    }
    const files = [new File([await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })], 'a.jpg', { type: 'image/jpeg' }), new File([await c.convertToBlob({ type: 'image/png' })], 'b.png', { type: 'image/png' })];
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await wait(400);
    const tool = [...document.querySelectorAll('.tool')].find((el) => !el.hidden);
    // 拖进来就自动开始处理，等所有行都处理完
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      await wait(200);
      if (![...tool.querySelectorAll('.imgrow')].some((r) => /--(ready|processing)/.test(r.className))) break;
    }
    const statuses = [...tool.querySelectorAll('.imgrow')].map((r) => r.className.replace('imgrow imgrow--', ''));
    tool.querySelector('.imgrow__actions button.btn--small')?.click();
    await wait(300);
    const dialog = document.querySelector('dialog.compare');
    const opened = dialog?.open === true;
    dialog?.querySelector('.btn--icon')?.click();
    await wait(300);
    const downloads = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
    [...tool.querySelectorAll('.imgbar__actions button')].at(-1).click();
    await wait(1000);
    HTMLAnchorElement.prototype.click = click;
    return { statuses, opened, closed: !document.querySelector('dialog.compare'), downloads };
  });
  if (ui.statuses.some((s) => s !== 'done' && s !== 'kept')) throw new Error(`UI processing regression: ${JSON.stringify(ui)}`);
  if (!ui.opened || !ui.closed) throw new Error(`Compare dialog regression: ${JSON.stringify(ui)}`);
  if (ui.downloads[0] !== 'compressed-images.zip') throw new Error(`Download regression: ${JSON.stringify(ui)}`);
  return { pipeline, ui };
}
