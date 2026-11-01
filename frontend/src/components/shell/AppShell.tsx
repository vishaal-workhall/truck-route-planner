import { useEffect, useRef, type ReactNode } from 'react';
import {
  MapTrifold,
  Path,
  ShieldCheck,
  SquaresFour,
  Truck,
} from '@phosphor-icons/react';

export type AppView = 'board' | 'plan' | 'review' | 'rules';

interface AppShellProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
  canReview: boolean;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  alert?: string | null;
  children: ReactNode;
}

const NAV: { id: AppView; label: string; icon: typeof SquaresFour }[] = [
  { id: 'board', label: 'Dispatch', icon: SquaresFour },
  { id: 'plan', label: 'Plan', icon: Path },
  { id: 'review', label: 'Routes', icon: MapTrifold },
  { id: 'rules', label: 'Rules', icon: ShieldCheck },
];

export function AppShell({
  view,
  onNavigate,
  canReview,
  title,
  subtitle,
  actions,
  loading,
  alert,
  children,
}: AppShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-[100dvh] flex-col border-r border-sidebar-line bg-sidebar lg:flex">
        <button
          type="button"
          onClick={() => onNavigate('board')}
          className="flex cursor-pointer items-center gap-2.5 px-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
        >
          <span className="flex h-8 w-8 items-center justify-center bg-white text-ink">
            <Truck size={16} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">HaulGuard</span>
            <span className="block text-xs text-[#b7c2cc]">Route safety</span>
          </span>
        </button>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              disabled={item.id === 'review' && !canReview}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
        <p className="border-t border-sidebar-line px-3 py-3 text-xs leading-5 text-[#b7c2cc]">
          Weather, weight, and road surface scored on the same corridor.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div className="sticky top-0 z-20 bg-canvas">
          <nav
            aria-label="Primary"
            className="flex gap-1 overflow-x-auto border-b border-sidebar-line bg-sidebar px-2 py-2 lg:hidden"
          >
            <button
              type="button"
              onClick={() => onNavigate('board')}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label="HaulGuard home"
            >
              <Truck size={16} />
            </button>
            {NAV.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={view === item.id}
                disabled={item.id === 'review' && !canReview}
                onNavigate={onNavigate}
                compact
              />
            ))}
          </nav>
          <header className="relative border-b border-line">
            <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="min-w-0">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="truncate text-base font-semibold text-ink outline-none"
                >
                  {title}
                </h1>
                {subtitle ? (
                  <p className="truncate text-xs text-muted">{subtitle}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            </div>
            {loading ? (
              <div
                className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-line"
                role="progressbar"
                aria-label="Working"
              >
                <div className="load-bar h-full w-1/3 bg-ink" />
              </div>
            ) : null}
          </header>
          {alert ? (
            <div
              role="alert"
              className="border-b border-[#f0b8b2] bg-[#fde8e6] px-4 py-2 text-sm text-[#6f1d18] sm:px-6"
            >
              {alert}
            </div>
          ) : null}
        </div>
        <main id="main" className="flex-1 px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  disabled,
  onNavigate,
  compact = false,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  disabled: boolean;
  onNavigate: (view: AppView) => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      title={disabled ? 'Plan a journey before comparing routes' : undefined}
      onClick={() => {
        if (!disabled) onNavigate(item.id);
      }}
      className={`flex min-h-10 cursor-pointer items-center gap-2.5 px-2.5 text-left text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white ${
        compact ? 'shrink-0 px-3' : 'w-full'
      } ${
        disabled
          ? 'cursor-not-allowed text-[#7e8b99]'
          : active
            ? 'bg-white/10 text-white'
            : 'text-[#c5ced6] hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon size={16} />
      <span className={compact ? 'sr-only sm:not-sr-only' : undefined}>{item.label}</span>
    </button>
  );
}
