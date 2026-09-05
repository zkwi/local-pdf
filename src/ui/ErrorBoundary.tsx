import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { browserEnvironment, crashDiagnostics, feedbackUrl } from './feedback.ts';

interface State {
  readonly error: Error | null;
}

/**
 * 界面某处抛了没接住的错误时，别让整页变白：给一句说明、刷新按钮和反馈入口。
 * 它包在 I18nProvider 外面，所以文案是固定的中英双语。
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Local PDF crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <div className="interstitial" role="alert">
        <div className="interstitial__card">
          <h1>Something went wrong · 页面出错了</h1>
          <p>
            The page hit an unexpected error. Reloading usually fixes it; your files were never
            uploaded, so nothing has left your computer.
          </p>
          <p>页面遇到了意外错误，刷新一般就能恢复；文件从未上传，不会有任何泄露。</p>
          <p className="interstitial__url">{error.message}</p>
          <div className="interstitial__actions">
            <button className="btn btn--primary" type="button" onClick={() => location.reload()}>
              Reload · 刷新页面
            </button>
            <a
              className="btn btn--ghost"
              href={feedbackUrl(
                {
                  kind: 'bug',
                  title: `Page crashed: ${error.message.slice(0, 80)}`,
                  tool: location.pathname,
                  diagnostics: crashDiagnostics(error),
                },
                browserEnvironment(document.documentElement.lang || 'en'),
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              Report an issue · 反馈问题
            </a>
          </div>
        </div>
      </div>
    );
  }
}
