import { Link } from 'react-router'
import { Logo } from '@/components/ui/Logo'

const COLUMNS = [
  {
    title: 'MartIT',
    links: [
      { to: '/#how-it-works', label: 'How it works' },
      { to: '/#categories', label: 'Categories' },
      { to: '/#about', label: 'About' },
      { to: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/login', label: 'Log in' },
      { to: '/signup', label: 'Create account' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/terms-and-conditions', label: 'Terms & Conditions' },
      { to: '/privacy-policy', label: 'Privacy Policy' },
    ],
  },
]

/** Footer with internal navigation and transparent compliance links. */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:px-6">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm text-ink-muted">
            Groceries and daily essentials for campuses, hostels and residential communities — delivered by student runners.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="font-sans text-sm font-semibold text-ink">{col.title}</h2>
            <ul className="mt-3 grid gap-2">
              {col.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-ink-muted transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-3 px-4 py-5 text-[13px] text-ink-subtle md:px-6">
          <p>© {new Date().getFullYear()} MartIT. Prices and products shown in this build are sample data.</p>
          <div className="flex items-center gap-4 text-xs font-medium">
            <Link to="/terms-and-conditions" className="hover:text-ink transition-colors">
              Terms &amp; Conditions
            </Link>
            <span className="text-line-strong">•</span>
            <Link to="/privacy-policy" className="hover:text-ink transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
