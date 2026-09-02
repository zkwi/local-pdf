import { LOCALES, useI18n } from '../i18n/index.tsx';
import type { Locale } from '../i18n/index.tsx';

export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="lang">
      <span className="visually-hidden">{t('app.language')}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true" className="lang__icon">
        <path
          d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 1.5c1 0 2.2 1.9 2.7 5H7.3c.5-3.1 1.7-5 2.7-5Zm-6.4 5h2.2c.1-1.9.5-3.6 1.1-4.7A6.6 6.6 0 0 0 3.6 8.5Zm0 3a6.6 6.6 0 0 0 3.3 4.7c-.6-1.1-1-2.8-1.1-4.7H3.6Zm3.7 0h5.4c-.5 3.1-1.7 5-2.7 5s-2.2-1.9-2.7-5Zm6.9 0c-.1 1.9-.5 3.6-1.1 4.7a6.6 6.6 0 0 0 3.3-4.7h-2.2Zm0-3h2.2a6.6 6.6 0 0 0-3.3-4.7c.6 1.1 1 2.8 1.1 4.7Z"
          fill="currentColor"
        />
      </svg>
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
