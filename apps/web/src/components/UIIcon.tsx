/** Original stroke icons for application controls; circuit symbols have their own semantics. */
const shapes = {
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.2 6a8 8 0 0 1 13.5 4M4.3 14a8 8 0 0 0 13.5 4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M15 4V3H4v13h1" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  undo: (
    <>
      <path d="m8 5-5 5 5 5" />
      <path d="M3 10h10a7 7 0 0 1 7 7v2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4" />
    </>
  ),
  save: (
    <>
      <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10l-7-7Z" />
      <path d="M8 3v6h8M7 21v-7h10v7" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2.5" fill="var(--surface, #2d2d30)" />
      <circle cx="15" cy="17" r="2.5" fill="var(--surface, #2d2d30)" />
    </>
  ),
  expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
  restore: <path d="M3 9h6V3m6 0v6h6M9 21v-6H3m18 0h-6v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  tree: (
    <>
      <path d="M5 4v14h5M5 8h5M15 8h5M15 18h5" />
      <path d="M10 5h5v6h-5zm0 10h5v6h-5z" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M14 3v6h6" />
    </>
  ),
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20" />,
  circuit: (
    <>
      <path d="M2 6h6m6 0h8M2 18h12m6 0h2M8 3h6v6H8zm6 12h6v6h-6zM11 9v9" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v.1" />
    </>
  ),
  book: (
    <>
      <path d="M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a5 5 0 0 0-4 2 5 5 0 0 0-4-2H3Z" />
    </>
  ),
  play: <path d="m8 4 12 8-12 8Z" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  more: (
    <>
      <circle cx="5" cy="12" r=".9" fill="currentColor" />
      <circle cx="12" cy="12" r=".9" fill="currentColor" />
      <circle cx="19" cy="12" r=".9" fill="currentColor" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  workspace: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;
export type UIIconName = keyof typeof shapes;
export function UIIcon({
  name,
  size = 16,
  className = "",
}: {
  name: UIIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`fq-ui-icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
