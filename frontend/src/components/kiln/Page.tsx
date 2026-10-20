import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The product mark: three people and the lines between them, on an ember tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('ember inline-flex size-7 shrink-0 items-center justify-center rounded-[8px]', className)}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 5.5 4.4 10.4M8 5.5l3.6 4.9M5.6 12h4.8" strokeLinecap="round" />
        <circle cx="8" cy="3.6" r="2" fill="currentColor" stroke="none" />
        <circle cx="3.6" cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="12.4" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export interface PageBandProps {
  title: ReactNode;
  /** One line under the title, in the band's muted text. */
  meta?: ReactNode;
  /** Buttons at the band's right; they wrap under the title on a phone. */
  actions?: ReactNode;
  /** Something before the title, such as the person's photo. */
  leading?: ReactNode;
  back?: { to: string; label: string };
  /** The ember glow is for the People page's band only. */
  glow?: boolean;
}

/** The ink band that names every page, directly under the app bar. */
export function PageBand({ title, meta, actions, leading, back, glow }: PageBandProps) {
  return (
    <section
      className="ink min-[1200px]:mx-auto min-[1200px]:max-w-[1200px] min-[1200px]:rounded-b-[16px]"
      style={glow ? { backgroundImage: 'var(--ember-glow), var(--ink)' } : undefined}
    >
      <div className="mx-auto max-w-[1200px] px-[var(--gutter)] pt-4 pb-6">
        {back && (
          <Link
            to={back.to}
            className="text-band-muted hover:bg-band-ghost hover:text-band-text focus-ring -ml-3 mb-1 inline-flex h-12 items-center gap-1.5 rounded-[12px] px-3 font-nav text-[15px] font-medium transition-colors duration-200"
          >
            <ArrowLeft className="size-4" />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            {leading}
            <div className="min-w-0 space-y-1">
              <h1 className="display-face text-[28px] leading-[32px] tracking-[-0.02em] [overflow-wrap:anywhere] md:text-[32px] md:leading-[36px]">
                {title}
              </h1>
              {meta && (
                <div className="text-band-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.7px] leading-[21px] font-medium">
                  {meta}
                </div>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

/** Content under the band: the 1200px column with Kiln's gutters. */
export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('mx-auto max-w-[1200px] px-[var(--gutter)] pt-6 pb-16 md:pt-8', className)}>
      {children}
    </div>
  );
}

/**
 * Signed-out pages (sign in, invite): the brand bar, an ink strip with the title, and one
 * narrow column under it.
 */
export function NarrowFrame({
  title,
  meta,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const column = 'mx-auto w-full max-w-[480px] px-[var(--gutter)] sm:px-0';
  return (
    <div className="min-h-svh">
      <header className="ink border-band-divider border-b">
        <div className="mx-auto flex min-h-16 max-w-[1200px] items-center gap-2.5 px-[var(--gutter)]">
          <BrandMark />
          <span className="display-face text-[16px] leading-6">RelationTree</span>
        </div>
      </header>
      <section className="ink sm:mx-auto sm:max-w-[528px] sm:rounded-b-[16px]">
        <div className={cn(column, 'space-y-1 pt-6 pb-6')}>
          <h1 className="display-face text-[28px] leading-[32px] tracking-[-0.02em] [overflow-wrap:anywhere]">
            {title}
          </h1>
          {meta && <p className="text-band-muted text-[14.7px] leading-[21px] font-medium">{meta}</p>}
        </div>
      </section>
      <div className={cn(column, 'pt-6 pb-16')}>{children}</div>
    </div>
  );
}

/** A section head (Unbounded) with optional controls at its right. */
export function SectionHead({
  title,
  children,
  id,
}: {
  title: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="display-face text-[20px] leading-[26px] tracking-[-0.01em]">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Quiet status line for loading, empty and error states inside a panel or page. */
export function Note({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'error';
  className?: string;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'text-[15px] leading-[22px]',
        tone === 'error' ? 'text-accent-text font-medium' : 'text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}
