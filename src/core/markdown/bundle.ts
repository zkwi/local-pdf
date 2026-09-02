import { strToU8, zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import type { ConversionOutput } from '../contracts/report.ts';
import type { MarkdownBundle } from './writer.ts';

/**
 * 没有图片就直接给一个 .md；有图片才打成 zip（.md + assets/ + manifest.json）。
 * 用户多数时候只想要一个能直接打开的文本文件，不该为了 manifest 逼他解压。
 */
export function packMarkdown(bundle: MarkdownBundle, baseName: string): ConversionOutput {
  if (bundle.assets.size === 0) {
    return {
      kind: 'markdown',
      blob: new Blob([bundle.markdown], { type: 'text/markdown;charset=utf-8' }),
      fileName: `${baseName}.md`,
    };
  }

  const assets: Zippable = {};
  for (const [name, data] of bundle.assets) {
    // PNG 已经压过，再压只费时间
    assets[name] = [data, { level: 0 }];
  }
  const files: Zippable = {
    [`${baseName}.md`]: [strToU8(bundle.markdown), { level: 6 }],
    'manifest.json': [strToU8(JSON.stringify(bundle.manifest, null, 2)), { level: 6 }],
    assets,
  };
  const zipped = zipSync(files);
  return {
    kind: 'markdown-bundle',
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    fileName: `${baseName}.markdown.zip`,
  };
}
