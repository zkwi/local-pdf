import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // 相对 base，方便直接扔到任意静态目录 / file 协议以外的子路径下托管
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      // remark 链路里的这个包 browser 入口在模块顶层 document.createElement，Worker 里直接炸；
      // 它的 node 入口是纯 JS 查表，主线程和 Worker 都能用
      'decode-named-character-reference': fileURLToPath(
        new URL('./node_modules/decode-named-character-reference/index.js', import.meta.url),
      ),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // PaddleOCR.js 内部用 new URL('./assets/worker-entry-*.js', import.meta.url) 起嵌套 Worker，
    // 预构建会把 import.meta.url 指到 .vite/deps 下，相对路径就找不到了，必须排除。
    exclude: ['@paddleocr/paddleocr-js'],
    include: [
      // 被排除的包自己的 CommonJS 依赖要单独列出来预构建，否则 dev 里拿不到默认导出
      '@paddleocr/paddleocr-js > clipper-lib',
      '@paddleocr/paddleocr-js > @techstark/opencv-js',
      // 这些只在转换 Worker 里用到；提前列出来，避免首次转换途中发现新依赖而触发整页重载
      'pdfjs-dist',
      'pdfjs-dist/build/pdf.worker.mjs',
      'docx',
      'fflate',
      'unified',
      'remark-stringify',
      'remark-gfm',
    ],
  },
  build: {
    target: 'es2022',
    // pdf.js worker 打进转换 worker 里，单块必然偏大，关掉噪音告警
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
