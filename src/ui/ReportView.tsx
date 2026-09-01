import type { ConversionReport } from '../core/contracts/report.ts';

interface ReportViewProps {
  readonly report: ConversionReport;
}

function confidenceClass(value: number): string {
  if (value >= 0.8) return 'pill pill--ok';
  if (value >= 0.6) return 'pill pill--warn';
  return 'pill pill--bad';
}

export function ReportView({ report }: ReportViewProps) {
  const pageWarnings = report.pages.flatMap((p) => p.warnings);
  const allWarnings = [...report.warnings, ...pageWarnings];
  const totalChars = report.pages.reduce((s, p) => s + p.characters, 0);
  const totalTables = report.pages.reduce((s, p) => s + p.tables, 0);
  const totalImages = report.pages.reduce((s, p) => s + p.images, 0);
  const ocrPages = report.pages.filter((p) => p.ocrApplied).length;

  return (
    <div className="report">
      <div className="report__stats">
        <Stat label="页数" value={String(report.pageCount)} />
        <Stat label="字符" value={totalChars.toLocaleString('zh-CN')} />
        <Stat label="表格" value={String(totalTables)} />
        <Stat label="图片" value={String(totalImages)} />
        <Stat label="OCR 页" value={String(ocrPages)} />
        <Stat label="耗时" value={`${(report.totalDurationMs / 1000).toFixed(1)}s`} />
      </div>

      {allWarnings.length > 0 && (
        <details className="report__warnings">
          <summary>{allWarnings.length} 条提示，建议核对</summary>
          <ul>
            {allWarnings.slice(0, 60).map((w, i) => (
              <li key={`${w.code}-${i}`}>
                <code>{w.code}</code> {w.message}
              </li>
            ))}
            {allWarnings.length > 60 && <li>… 其余 {allWarnings.length - 60} 条已省略</li>}
          </ul>
        </details>
      )}

      <details className="report__pages">
        <summary>逐页明细</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>页</th>
                <th>把握</th>
                <th>栏</th>
                <th>段落</th>
                <th>标题</th>
                <th>列表</th>
                <th>表格</th>
                <th>图片</th>
                <th>字符</th>
              </tr>
            </thead>
            <tbody>
              {report.pages.map((page) => (
                <tr key={page.index}>
                  <td>{page.index + 1}</td>
                  <td>
                    <span className={confidenceClass(page.confidence)}>
                      {(page.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td>{page.columnCount}</td>
                  <td>{page.paragraphs}</td>
                  <td>{page.headings}</td>
                  <td>{page.listItems}</td>
                  <td>{page.tables}</td>
                  <td>{page.images}</td>
                  <td>{page.characters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}
