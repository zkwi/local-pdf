import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_OPTIONS } from './core/contracts/options.ts';
import type { ConvertOptions } from './core/contracts/options.ts';
import { useConversionQueue } from './hooks/useConversionQueue.ts';
import { DropZone } from './ui/DropZone.tsx';
import { JobCard } from './ui/JobCard.tsx';
import { OptionsPanel } from './ui/OptionsPanel.tsx';

export function App() {
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS);
  const [panelOpen, setPanelOpen] = useState(false);
  const { jobs, enqueue, cancel, retry, remove, clearFinished } = useConversionQueue();

  const handleFiles = useCallback(
    (files: File[]) => {
      enqueue(files, options);
    },
    [enqueue, options],
  );

  const handleRetry = useCallback(
    (id: string, password?: string) => {
      retry(id, password === undefined ? options : { ...options, password });
    },
    [options, retry],
  );

  const finished = useMemo(() => jobs.filter((job) => job.status === 'done'), [jobs]);
  const busy = jobs.some((job) => job.status === 'running' || job.status === 'queued');

  const downloadAll = useCallback(() => {
    for (const job of finished) {
      if (!job.result) continue;
      const link = document.createElement('a');
      link.href = job.result.url;
      link.download = job.result.fileName;
      document.body.append(link);
      link.click();
      link.remove();
    }
  }, [finished]);

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__brand">
          <span className="masthead__mark" aria-hidden="true">
            P→W
          </span>
          <div>
            <h1>PDF 转 Word</h1>
            <p>解析、版面分析、DOCX 生成全部在浏览器里完成，文件不会上传到任何服务器。</p>
          </div>
        </div>
        <span className="badge" title="没有任何上传接口，可在断网状态下使用">
          本地转换
        </span>
      </header>

      <main className="main">
        <DropZone onFiles={handleFiles} />

        <OptionsPanel
          options={options}
          onChange={setOptions}
          open={panelOpen}
          onToggle={() => setPanelOpen((v) => !v)}
        />

        {jobs.length > 0 && (
          <section className="queue">
            <div className="queue__head">
              <h2>转换队列（{jobs.length}）</h2>
              <div className="queue__actions">
                {finished.length > 1 && (
                  <button className="btn btn--ghost" type="button" onClick={downloadAll}>
                    下载全部（{finished.length}）
                  </button>
                )}
                {!busy && jobs.length > 0 && (
                  <button className="btn btn--ghost" type="button" onClick={clearFinished}>
                    清空列表
                  </button>
                )}
              </div>
            </div>
            <div className="queue__list">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onCancel={cancel}
                  onRetry={handleRetry}
                  onRemove={remove}
                />
              ))}
            </div>
          </section>
        )}

        <section className="notes">
          <h2>能做到什么，做不到什么</h2>
          <div className="notes__grid">
            <div>
              <h3>做得比较稳</h3>
              <ul>
                <li>文字型 PDF 的段落、标题、列表、阅读顺序</li>
                <li>中英文混排的空格处理、西文行尾断词合并</li>
                <li>双栏论文的分栏与栏内顺序</li>
                <li>有框线表格，包括合并单元格</li>
                <li>跨页重复的页眉页脚与页码</li>
              </ul>
            </div>
            <div>
              <h3>已知的边界</h3>
              <ul>
                <li>无框线表格默认不识别，误判代价高于收益</li>
                <li>字体不会嵌入，换字体后换行位置会变</li>
                <li>公式、复杂矢量图按图片处理，不可编辑</li>
                <li>竖排与旋转文字会被压平成普通段落</li>
                <li>OCR 结果必然有误差，重要文件请核对</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>MIT 许可 · pdf.js + docx.js + Tesseract.js</span>
        <span>转换质量参考每份文件的「转换报告」，把握度低的页面建议人工核对。</span>
      </footer>
    </div>
  );
}
