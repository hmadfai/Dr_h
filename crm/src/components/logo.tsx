export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" aria-hidden>
        <rect width="48" height="48" rx="10" fill="#042f7e" />
        <path d="M10 32V16h6.2c3.6 0 5.8 1.8 5.8 4.7 0 1.8-1 3.2-2.7 4l3.2 7.3h-4.3l-2.8-6.6h-1.6V32H10zm4-9.4h1.8c1.5 0 2.4-.7 2.4-1.9s-.9-1.8-2.4-1.8H14v3.7zM29.2 16l5.4 16h-4.2l-.8-2.6h-5.1L23.6 32h-4.1l5.5-16h4.2zm-.4 10.3-1.6-5.4-1.6 5.4h3.2z" fill="#fff" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-white">trainingindata</div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/70">Apprenticeship CRM</div>
        </div>
      )}
    </div>
  );
}
