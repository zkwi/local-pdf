/** 站点级常量：仓库地址、版本号。版本号由 vite.config.ts 从 package.json 注入。 */
export const SITE = {
  repo: 'https://github.com/zkwi/local-pdf',
  issues: 'https://github.com/zkwi/local-pdf/issues',
  version: __APP_VERSION__,
  /** 页面上"试试示例"用的文件，放在 public/samples/ */
  samplePath: 'samples/demo.pdf',
} as const;
