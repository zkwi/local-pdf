/**
 * 品牌标：一张带折角的页面，页面里一把锁——"Your PDF stays local"。
 * 和 public/favicon.svg 是同一张图，改一处记得改另一处。
 */
export function Logo({ size = 46 }: { readonly size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <path d="M20 14h17l9 9v27a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3Z" fill="#fff" />
      <path
        d="M37 14v9h9"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="25" y="33" width="14" height="11" rx="2.5" fill="var(--accent)" />
      <path
        d="M28 33v-3.5a4 4 0 0 1 8 0V33"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
