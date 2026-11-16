import { useEffect, useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router'
import {
  FileText,
  Shield,
  ArrowLeft,
  Printer,
  ChevronDown,
  AlertTriangle,
  Scale,
  Clock,
  Building,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

/**
 * Reusable layout shell for legal documents (Terms & Conditions, Privacy Policy).
 * Provides a responsive sticky Table of Contents, active section tracking,
 * document switcher, and accessible typography.
 */
export function LegalPageShell({
  title,
  subtitle,
  documentType, // 'terms' | 'privacy'
  effectiveDate,
  lastUpdated,
  version,
  sections,
  children,
}) {
  const location = useLocation()
  const [activeSection, setActiveSection] = useState(sections[0]?.id || '')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // IntersectionObserver to highlight current active section in TOC
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((e) => e.isIntersecting)
        if (visibleEntries.length > 0) {
          // Sort by top distance to pick the topmost visible section
          const topEntry = visibleEntries.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0]
          setActiveSection(topEntry.target.id)
        }
      },
      {
        rootMargin: '-100px 0px -60% 0px',
        threshold: [0, 0.25, 0.5, 1],
      },
    )

    sections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [sections])

  // Handle initial hash on page load
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '')
      const el = document.getElementById(id)
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth' })
          setActiveSection(id)
        }, 100)
      }
    } else {
      window.scrollTo(0, 0)
    }
  }, [location.pathname, location.hash])

  const handlePrint = () => {
    window.print()
  }

  const currentSectionTitle = useMemo(() => {
    return sections.find((s) => s.id === activeSection)?.title || 'Table of Contents'
  }, [sections, activeSection])

  return (
    <div className="min-h-screen bg-bg text-ink pb-20">
      {/* Top Header & Breadcrumb Banner */}
      <section className="border-b border-line bg-surface/60 backdrop-blur-md pt-8 pb-10">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-ink transition-colors rounded-tile py-1 px-2 -ml-2 hover:bg-surface-2"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span>Back to Home</span>
            </Link>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrint}
                className="text-xs text-ink-muted hover:text-ink print:hidden"
                aria-label="Print legal document"
              >
                <Printer className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Print / Save PDF</span>
              </Button>
              <Badge tone="brand" size="sm">
                India Legal Compliance Draft
              </Badge>
            </div>
          </div>

          {/* Switcher Tabs */}
          <div className="inline-flex items-center p-1 rounded-xl bg-surface-2 border border-line mb-6 print:hidden">
            <Link
              to="/terms-and-conditions"
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
                documentType === 'terms'
                  ? 'bg-surface text-ink shadow-1'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <FileText className="size-3.5" aria-hidden="true" />
              <span>Terms & Conditions</span>
            </Link>
            <Link
              to="/privacy-policy"
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
                documentType === 'privacy'
                  ? 'bg-surface text-ink shadow-1'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <Shield className="size-3.5" aria-hidden="true" />
              <span>Privacy Policy</span>
            </Link>
          </div>

          <div className="max-w-3xl">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-3 text-base sm:text-lg text-ink-muted leading-relaxed">
              {subtitle}
            </p>

            {/* Document Metadata Bar */}
            <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-ink-subtle">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-brand" aria-hidden="true" />
                <span>Effective Date: <strong>{effectiveDate}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-fresh-ink" aria-hidden="true" />
                <span>Last Updated: <strong>{lastUpdated}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <Scale className="size-3.5 text-ink-subtle" aria-hidden="true" />
                <span>Version: <strong>{version}</strong></span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="mx-auto max-w-6xl px-4 md:px-6 pt-8">
        {/* Pre-launch Legal Review Advisory Banner */}
        <div className="mb-8 rounded-card border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 p-4 sm:p-5 text-ink">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
            <div className="text-xs sm:text-sm leading-relaxed space-y-1">
              <p className="font-bold text-amber-900 dark:text-amber-200">
                Pre-Launch Draft for Business &amp; Legal Counsel Review
              </p>
              <p className="text-ink-muted">
                This document is a formal pre-publication draft formulated for <strong>MartIT</strong> as an Indian campus grocery ordering and student peer-delivery service. Items requiring operational or corporate entity finalization are marked as{' '}
                <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[11px] font-bold text-amber-900 dark:text-amber-200">
                  [TO BE CONFIRMED]
                </span>
                . It incorporates requirements under the Information Technology Act, 2000, the Consumer Protection (E-Commerce) Rules, 2020, and the Digital Personal Data Protection Act, 2023 (subject to notified rules).
              </p>
            </div>
          </div>
        </div>

        {/* Mobile Sticky Table of Contents Header */}
        <div className="lg:hidden sticky top-16 z-30 mb-6 rounded-card border border-line bg-surface/95 backdrop-blur-md p-3 shadow-1 print:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex w-full items-center justify-between text-left text-xs font-semibold text-ink"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-toc"
          >
            <span className="flex items-center gap-2 truncate">
              <span className="text-ink-subtle">Jump to:</span>
              <span className="text-brand font-bold truncate">{currentSectionTitle}</span>
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-ink-muted transition-transform duration-200',
                mobileMenuOpen && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>

          {mobileMenuOpen && (
            <nav
              id="mobile-toc"
              className="mt-3 max-h-72 overflow-y-auto border-t border-line pt-2 text-xs divide-y divide-line/40"
              aria-label="Mobile Table of Contents"
            >
              {sections.map((sec, idx) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2 py-2 px-1 transition-colors',
                    activeSection === sec.id
                      ? 'font-bold text-brand bg-brand-soft/40 rounded px-2'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <span className="font-mono text-[11px] text-ink-subtle w-6 shrink-0">
                    {String(idx + 1).padStart(2, '0')}.
                  </span>
                  <span className="truncate">{sec.title}</span>
                </a>
              ))}
            </nav>
          )}
        </div>

        {/* Desktop 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-10 items-start">
          {/* Desktop Sticky Sidebar TOC */}
          <aside className="hidden lg:block sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-3 print:hidden">
            <div className="rounded-card border border-line bg-surface p-4 shadow-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-3 flex items-center justify-between">
                <span>Contents</span>
                <span className="text-[10px] font-mono text-ink-subtle">
                  {sections.length} Sections
                </span>
              </h2>

              <nav aria-label="Table of Contents" className="space-y-0.5 text-xs">
                {sections.map((sec, idx) => {
                  const isActive = activeSection === sec.id
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      className={cn(
                        'group flex items-start gap-2.5 rounded-tile py-1.5 px-2.5 text-xs transition-all leading-snug',
                        isActive
                          ? 'bg-brand-soft text-brand-hover dark:bg-brand-soft/20 dark:text-brand-soft font-bold'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <span
                        className={cn(
                          'font-mono text-[10px] shrink-0 mt-0.5',
                          isActive ? 'text-brand font-bold' : 'text-ink-subtle',
                        )}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="line-clamp-2">{sec.title}</span>
                    </a>
                  )
                })}
              </nav>

              <div className="mt-5 pt-4 border-t border-line flex flex-col gap-2">
                <Link
                  to={documentType === 'terms' ? '/privacy-policy' : '/terms-and-conditions'}
                  className="flex items-center justify-between text-xs font-semibold text-brand hover:underline"
                >
                  <span>
                    {documentType === 'terms' ? 'Read Privacy Policy' : 'Read Terms & Conditions'}
                  </span>
                  <ExternalLink className="size-3" aria-hidden="true" />
                </Link>
                <a
                  href="#contact-grievance"
                  className="text-[11px] text-ink-subtle hover:text-ink transition-colors"
                >
                  Grievance Redressal Officer
                </a>
              </div>
            </div>
          </aside>

          {/* Main Article Body */}
          <article className="prose-clean min-w-0 max-w-full">
            {children}

            {/* Document Bottom Footer Card */}
            <div className="mt-16 rounded-card border border-line bg-surface p-6 shadow-1 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 print:border-none print:shadow-none">
              <div>
                <h3 className="font-display text-base font-bold text-ink">
                  Questions regarding this document?
                </h3>
                <p className="mt-1 text-xs text-ink-muted max-w-md">
                  Reach out to the MartIT Grievance &amp; Compliance Desk. Official response timelines and contact details are set out in Section {documentType === 'terms' ? '19' : '20'}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Button asChild variant="secondary" size="sm">
                  <Link to={documentType === 'terms' ? '/privacy-policy' : '/terms-and-conditions'}>
                    {documentType === 'terms' ? 'View Privacy Policy' : 'View Terms & Conditions'}
                  </Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
