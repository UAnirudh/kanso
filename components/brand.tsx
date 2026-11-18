export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-[8px] border border-[#2a2e37] bg-gradient-to-br from-[#1a1c22] to-[#101216]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2 12V2" stroke="#8b7cf8" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M2 8.5 7 3.5" stroke="#c8cad2" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6 7.5 12 12" stroke="#c8cad2" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#e8e9ee]">
          Kanso
        </span>
      )}
    </div>
  );
}
