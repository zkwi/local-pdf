// 用 playwright-cli run-code --filename 执行，页面须是已启动的 Vite 开发站。
// CLI 需要无尾部分号的函数表达式，保留此文件的表达式格式。
// prettier-ignore
async (page) => {
  const requests = [];
  const record = (request) => {
    if (request.url().includes('audit.invalid')) requests.push(request.url());
  };
  page.on('request', record);
  try {
    const result = await page.evaluate(async () => {
      const { htmlToPdf } = await import('/src/core/pdfgen/html-to-pdf.ts');
      const { markdownToHtml, prepareMarkdown } = await import('/src/core/pdfgen/markdown.ts');
      const options = { pageSize: 'a4', margin: 'normal', fontSize: 11 };
      const html = await markdownToHtml(
        '# Local test\n\nA𠮷B😀C\n\n![missing😀](missing.png)\n\n' +
          '![external](https://audit.invalid/pixel)\n\n' +
          '<img src="https://audit.invalid/raw" srcset="https://audit.invalid/set 2x">' +
          '<style>@import "https://audit.invalid/style";</style>' +
          '<iframe src="https://audit.invalid/frame"></iframe>' +
          '<meta http-equiv="refresh" content="0;url=https://audit.invalid/nav">' +
          '<div style="background:url(https://audit.invalid/bg)">safe text</div>\n\n' +
          '<table><tr><td colspan="2">merged cell</td></tr></table>',
      );
      let mergedCell = false;
      const output = await htmlToPdf(
        async (doc, signal) => {
          const sections = await prepareMarkdown(doc, html, new Map(), options, signal);
          mergedCell = sections[0].body.querySelector('td')?.colSpan === 2;
          return sections;
        },
        { cjk: 'zh-CN' },
      );
      const controller = new AbortController();
      const started = performance.now();
      const cancelled = await htmlToPdf(
        async (doc) => {
          const body = doc.createElement('div');
          const img = doc.createElement('img');
          img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3f0AAAAASUVORK5CYII=';
          Object.defineProperty(img, 'complete', { get: () => false });
          img.decode = () => new Promise(() => {});
          body.append(img);
          setTimeout(() => controller.abort(), 100);
          return [{ body, geometry: { width: 595, height: 842, margins: { top: 30, right: 30, bottom: 30, left: 30 }, headerDistance: 15, footerDistance: 15 } }];
        },
        { cjk: 'zh-CN' },
        { signal: controller.signal },
      ).then(() => 'unexpected success', (error) => error.name);
      const cancelMs = performance.now() - started;
      const next = await htmlToPdf(
        (doc, signal) => prepareMarkdown(doc, '<p>Next conversion succeeds</p>', new Map(), options, signal),
        { cjk: 'zh-CN' },
      );
      return { pages: output.pages, imagesSkipped: output.imagesSkipped, charactersReplaced: output.charactersReplaced, blockedContent: output.blockedContent, mergedCell, cancelled, cancelMs, nextPages: next.pages, remainingFrames: document.querySelectorAll('iframe').length };
    });
    if (requests.length !== 0) throw new Error('Document initiated network requests');
    if (result.pages !== 1 || result.imagesSkipped !== 3 || result.charactersReplaced !== 3 || result.blockedContent < 5 || !result.mergedCell) throw new Error(`Content regression: ${JSON.stringify(result)}`);
    if (result.cancelled !== 'AbortError' || result.cancelMs > 2000 || result.nextPages !== 1 || result.remainingFrames !== 0) throw new Error(`Cancellation regression: ${JSON.stringify(result)}`);
    return { ...result, networkRequests: requests.length };
  } finally {
    page.off('request', record);
  }
}
