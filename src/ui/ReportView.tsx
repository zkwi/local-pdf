import type { ConversionReport } from '../core/contracts/report.ts';
import { useI18n } from '../i18n/index.tsx';

interface ReportViewProps {
  readonly report: ConversionReport;
}

function confidenceClass(value: number): string {
  if (value >= 0.8) return 'pill pill--ok';
  if (value >= 0.6) return 'pill pill--warn';
  return 'pill pill--bad';
}

export function ReportView({ report }: ReportViewProps) {
  const { t, warningText } = useI18n();
  const pageWarnings = report.pages.flatMap((p) => p.warnings);
  // 少见的提示排前面：几百条"旋转文字"不该把唯一一条"图片超限"挤到看不见的地方
  const counts = new Map<string, number>();
  for (const w of [...report.warnings, ...pageWarnings]) {
    counts.set(w.code, (counts.get(w.code) ?? 0) + 1);
  }
  const allWarnings = [...report.warnings, ...pageWarnings].sort(
    (a, b) => (counts.get(a.code) ?? 0) - (counts.get(b.code) ?? 0),
  );
  const totalChars = report.pages.reduce((s, p) => s + p.characters, 0);
  const totalTables = report.pages.reduce((s, p) => s + p.tables, 0);
  const totalImages = report.pages.reduce((s, p) => s + p.images, 0);
  const ocrPages = report.pages.filter((p) => p.ocrApplied).length;

  return (
    <div className="report">
      <div className="report__stats">
        <Stat label={t('report.pages')} value={String(report.pageCount)} />
        <Stat label={t('report.characters')} value={totalChars.toLocaleString()} />
        <Stat label={t('report.tables')} value={String(totalTables)} />
        <Stat label={t('report.images')} value={String(totalImages)} />
        <Stat label={t('report.ocrPages')} value={String(ocrPages)} />
        {report.ocrEngine !== undefined && (
          <Stat label={t('report.ocrEngine')} value={report.ocrEngine} />
        )}
        <Stat
          label={t('report.duration')}
          value={`${(report.totalDurationMs / 1000).toFixed(1)}s`}
        />
      </div>

      {allWarnings.length > 0 && (
        <details className="report__warnings">
          <summary>{t('report.warnings', { count: allWarnings.length })}</summary>
          <ul>
            {allWarnings.slice(0, 60).map((w, i) => (
              <li key={`${w.code}-${i}`}>
                <code>{w.code}</code> {warningText(w)}
              </li>
            ))}
            {allWarnings.length > 60 && (
              <li>{t('report.more', { count: allWarnings.length - 60 })}</li>
            )}
          </ul>
        </details>
      )}

      <details className="report__pages">
        <summary>{t('report.pageDetails')}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('report.col.page')}</th>
                <th>{t('report.col.confidence')}</th>
                <th>{t('report.col.columns')}</th>
                <th>{t('report.col.paragraphs')}</th>
                <th>{t('report.col.headings')}</th>
                <th>{t('report.col.lists')}</th>
                <th>{t('report.col.tables')}</th>
                <th>{t('report.col.images')}</th>
                <th>{t('report.col.characters')}</th>
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
