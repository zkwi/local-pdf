/** 站点级常量：仓库地址、版本号。版本号由 vite.config.ts 从 package.json 注入。 */
export const SITE = {
  repo: 'https://github.com/zkwi/local-pdf',
  /** 页脚的反馈入口：直接落到 Issue 模板选择页 */
  issues: 'https://github.com/zkwi/local-pdf/issues/new/choose',
  changelog: 'https://github.com/zkwi/local-pdf/blob/main/CHANGELOG.md',
  version: __APP_VERSION__,
  /** 页面上"试试示例"用的文件，放在 public/samples/ */
  samplePath: 'samples/demo.pdf',
} as const;
