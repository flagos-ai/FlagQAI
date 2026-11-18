/** Original navigation drawings authored for FlagQuantum; no third-party assets. */
export function Icon({ name }: { name: string }) {
  const shapes: Record<string, React.ReactNode> = {
    agent: (
      <>
        <path d="M5 4.5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z" />
        <path d="M7.5 11.5h.1m4.4 0h.1m4.4 0h.1" strokeWidth="2.6" />
      </>
    ),
    model: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
        <path d="M14 3v6h6M8 13h8m-8 4h5" />
      </>
    ),
    synthesis: (
      <>
        <path d="M4 4h16M6.5 9h11M9 14h6M12 14v7m-3-3 3 3 3-3" />
        <path d="M4 3v2m16-2v2M6.5 8v2m11-2v2M9 13v2m6-2v2" />
      </>
    ),
    program: (
      <>
        <path d="M3 6h4m6 0h8M3 12h18M3 18h11m6 0h1M17 12v3" />
        <rect x="7" y="3" width="6" height="6" rx="1" />
        <circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="17" cy="18" r="3" />
        <path d="M15.5 18h3M17 16.5v3" />
      </>
    ),
    execution: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" />
        <path d="M5.5 12h3l2-4 3 8 2-4h3" />
      </>
    ),
    jobs: (
      <>
        <path d="M7 3h12a2 2 0 0 1 2 2v12M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
        <path d="m6.5 14 2.2 2.2 4.8-4.8" />
      </>
    ),
    guide: (
      <>
        <path d="M12 5.5C8.5 3 5.5 3 2.5 4.5v15C6 18 9 18.5 12 21c3-2.5 6-3 9.5-1.5v-15C18.5 3 15.5 3 12 5.5Zm0 0V21M6 8h2m8 0h2M6 12h2m8 0h2" />
      </>
    ),
    workspace: (
      <>
        <path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <path d="M3 11h18M9 11v10" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[name] || shapes.model}
    </svg>
  );
}
