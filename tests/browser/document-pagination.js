// 在 Vite 开发站用 playwright-cli run-code --filename 执行。
// 合成样本覆盖文本框内页码域及超过百页后的累计舍入误差，不需要私有文档。
// prettier-ignore
async (page) => {
  const result = await page.evaluate(async () => {
    const { patchPageFields, prepareDocx } = await import('/src/core/pdfgen/word.ts');
    const { htmlToPdf } = await import('/src/core/pdfgen/html-to-pdf.ts');
    const { prepareMarkdown } = await import('/src/core/pdfgen/markdown.ts');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const run = (inner) => `<w:r><w:rPr><w:sz w:val="24"/></w:rPr>${inner}</w:r>`;
    const complex = (instruction) => run('<w:fldChar w:fldCharType="begin"/>') + run(`<w:instrText>${instruction}</w:instrText>`) + run('<w:fldChar w:fldCharType="separate"/>') + run('<w:t>9</w:t>') + run('<w:fldChar w:fldCharType="end"/>');
    const wrap = (inner) => `<w:ftr xmlns:w="${ns}"><w:p>${inner}</w:p></w:ftr>`;
    const nested = wrap(run(`<w:pict><w:txbxContent><w:p>${complex(' PAGE ')}</w:p></w:txbxContent></w:pict>`) + run('<w:t>After textbox</w:t>'));
    const patched = patchPageFields(nested, { n: 0 });
    const doc = new DOMParser().parseFromString(patched, 'application/xml');
    if (doc.querySelector('parsererror') || doc.getElementsByTagNameNS(ns,'txbxContent').length !== 1 || !doc.documentElement.textContent.includes('After textbox') || doc.getElementsByTagNameNS(ns,'bookmarkStart').length !== 1 || doc.getElementsByTagNameNS(ns,'sz')[0]?.getAttributeNS(ns,'val') !== '24') throw new Error('Nested page field damaged XML or surrounding content');
    const ordinary = wrap(complex(' DATE ') + '<w:fldSimple w:instr="DATE"><w:r><w:t>cached date</w:t></w:r></w:fldSimple>');
    if (patchPageFields(ordinary, { n: 0 }) !== ordinary) throw new Error('Non-page fields changed');
    const totals = wrap('<w:fldSimple w:instr="NUMPAGES"><w:r><w:t>9</w:t></w:r></w:fldSimple>' + complex('SECTIONPAGES'));
    const totalDoc = new DOMParser().parseFromString(patchPageFields(totals, {n:1}), 'application/xml');
    if (totalDoc.getElementsByTagNameNS(ns,'bookmarkStart').length !== 2 || [...totalDoc.getElementsByTagNameNS(ns,'bookmarkStart')].some(el=>!el.getAttributeNS(ns,'name').includes('-pages-'))) throw new Error('Total page fields not patched');
    const nestedIf = wrap(run('<w:fldChar w:fldCharType="begin"/>') + run('<w:instrText> IF </w:instrText>') + complex('PAGE') + run('<w:fldChar w:fldCharType="end"/>'));
    if (patchPageFields(nestedIf, {n:0}) !== nestedIf) throw new Error('Nested non-page expression changed');
    const shared = wrap(run('<w:t>Before field</w:t><w:fldChar w:fldCharType="begin"/>') + run('<w:instrText>PAGE</w:instrText>') + run('<w:fldChar w:fldCharType="end"/><w:t>After field</w:t>'));
    if (patchPageFields(shared, {n:0}) !== shared) throw new Error('Text sharing a field run was removed');

    const count = 240;
    const output = await htmlToPdf(async (doc) => {
      const body = doc.createElement('div');
      body.style.fontFamily = 'Arial';
      for (let i=1;i<=count;i++) {
        const p=doc.createElement('p');
        p.style.cssText='margin:0;break-before:column;font:11pt Arial';
        p.textContent=`PAGE${String(i).padStart(3,'0')} END${String(i).padStart(3,'0')}`;
        body.append(p);
      }
      return [{body,geometry:{width:595.28,height:841.89,margins:{top:56.7,right:56.7,bottom:56.7,left:56.7},headerDistance:28,footerDistance:28}}];
    },{cjk:'zh-CN'});
    const { installInContextPdfWorker } = await import('/src/core/pdf/pdfjs-runtime.ts');
    installInContextPdfWorker();
    const { getDocument } = await import('/node_modules/.vite/deps/pdfjs-dist.js');
    const task = getDocument({data:output.bytes,useSystemFonts:true});
    const pdf = await task.promise;
    try {
      if (pdf.numPages !== count) throw new Error(`Expected ${count} pages, got ${pdf.numPages}`);
      for (let i=1;i<=count;i++) {
        const p=await pdf.getPage(i);
        const content=await p.getTextContent();
        const items=content.items.filter(item=>'str' in item);
        const text=items.map(item=>item.str).join('').replace(/\s/g,'');
        const expected=`PAGE${String(i).padStart(3,'0')}END${String(i).padStart(3,'0')}`;
        if (text !== expected || items.some(item=>item.transform[4]<55 || item.transform[4]+item.width>540)) throw new Error(`Text shifted or clipped on page ${i}`);
      }
    } finally { await task.destroy(); }
    const wide = await htmlToPdf((doc, signal) => prepareMarkdown(doc,
      `<pre><code>中文${' '.repeat(50)}列名\n上海${' '.repeat(50)}数据</code></pre>` +
      `<table><tr>${Array.from({length:4},()=>`<td>https://example.invalid/${'longword'.repeat(18)}</td>`).join('')}</tr></table>`,
      new Map(), {pageSize:'a4',margin:'normal',fontSize:11}, signal), {cjk:'zh-CN'});
    const wideTask = getDocument({data:wide.bytes,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,useSystemFonts:true});
    const widePdf = await wideTask.promise;
    try {
      let text='';
      for (let i=1;i<=widePdf.numPages;i++) {
        const content=await (await widePdf.getPage(i)).getTextContent();
        const items=content.items.filter(item=>'str' in item);
        const outside = items.filter(item=>item.str.trim() && (item.transform[4]<55 || item.transform[4]+item.width>540));
        if (outside.length) throw new Error(`CJK spaces or wide table overflowed: ${JSON.stringify(outside.map(item=>({text:item.str,x:item.transform[4],width:item.width})))}`);
        text+=items.map(item=>item.str).join('');
      }
      if (!text.replace(/\s/g,'').includes('中文列名上海数据')) throw new Error('CJK preformatted content was lost');
    } finally { await wideTask.destroy(); }
    const { zipSync, strToU8 } = await import('/node_modules/.vite/deps/fflate.js');
    const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const legacy = async (ext, mime, bytes) => {
      const source = new Blob([zipSync({
        '[Content_Types].xml': strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="${ext}" ContentType="${mime}"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
        '_rels/.rels': strToU8(`<Relationships xmlns="${relationships}"><Relationship Id="document" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`),
        'word/document.xml': strToU8(`<w:document xmlns:w="${ns}" xmlns:r="${office}" xmlns:v="urn:schemas-microsoft-com:vml"><w:body><w:p><w:r><w:pict><v:shape style="width:90pt;height:90pt"><v:imagedata r:id="image"/></v:shape></w:pict></w:r></w:p><w:p><w:r><w:t>After legacy image</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`),
        'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${relationships}"><Relationship Id="image" Type="${office}/image" Target="media/image.${ext}"/></Relationships>`),
        [`word/media/image.${ext}`]: bytes,
      })]);
      return htmlToPdf((doc,signal)=>prepareDocx(doc,source,signal),{cjk:'zh-CN'});
    };
    const bitmap = await legacy('png','image/png',Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3f0AAAAASUVORK5CYII='),c=>c.charCodeAt(0)));
    const emf = await legacy('emf','image/x-emf',new Uint8Array([1,0,0,0]));
    if (bitmap.imagesSkipped!==0 || !new TextDecoder().decode(bitmap.bytes).includes('/Subtype /Image') || emf.imagesSkipped!==1 || !emf.unsupportedImageFormats.includes('EMF')) throw new Error('Legacy Word image was lost or unsupported format was not reported');
    return {fieldCases:5,pages:count,wideContentPages:wide.pages,legacyImages:2,remainingFrames:document.querySelectorAll('iframe').length};
  });
  if (result.remainingFrames !== 0) throw new Error('Conversion frame leaked');
  return result;
}
