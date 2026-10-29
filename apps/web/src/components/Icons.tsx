export function Icon({ name }: { name: string }) {
  const shapes: Record<string, React.ReactNode> = {
    model: (
      <path
        d="m8 5-7 7 7 7m8-14 7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    ),
    synthesis: (
      <>
        <path
          d="M9 6h6M7 7v10h9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M1 1h8v8H1zm14 0h8v8h-8zm0 14h8v8h-8z" />
      </>
    ),
    program: (
      <>
        <path
          d="M1 4h22M12 4v16M1 20h22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="4" r="2.4" />
        <path d="M8 14h8v9H8z" />
      </>
    ),
    execution: (
      <>
        <circle cx="12" cy="12" r="11" />
        <path d="m10 7 6 5-6 5z" fill="#303030" />
      </>
    ),
    jobs: <path d="M2 13h5v10H2zm8-12h5v22h-5zm8 6h5v16h-5z" />,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      {shapes[name] || <path d="M4 4h16v16H4z" />}
    </svg>
  );
}
