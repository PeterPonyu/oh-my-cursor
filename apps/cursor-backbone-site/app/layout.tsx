import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

const SITE_URL = 'https://peterponyu.github.io/oh-my-cursor/'
const SIBLING_URL = 'https://peterponyu.github.io/oh-my-copilot/'
const DOCS_URL = 'https://github.com/PeterPonyu/oh-my-cursor/blob/main/README.md'
const STATE_CONTRACT_URL = 'https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/state-contract.md'
const REFERENCES_URL = 'https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/references.md'
const BENCHMARK_URL = 'https://github.com/PeterPonyu/oh-my-cursor/blob/main/benchmark/README.md'

type NavItem = {
  href: string
  label: string
  kind: 'internal' | 'external'
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'oh-my-cursor — docs-first Cursor backbone',
  description:
    'Flagship GitHub Pages landing surface for the repo-owned oh-my-cursor docs-first, evidence-backed Cursor backbone.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'oh-my-cursor — docs-first Cursor backbone',
    description:
      'Repo-owned Cursor backbone homepage with visible docs, state contract, references, benchmark notes, and sibling-context navigation.',
    url: SITE_URL,
    siteName: 'oh-my-cursor',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'oh-my-cursor — docs-first Cursor backbone',
    description:
      'Repo-owned Cursor backbone homepage with visible proof links and explicit ownership boundaries.',
  },
}

const NAV_ITEMS: NavItem[] = [
  { href: '#evidence', label: 'Evidence', kind: 'internal' },
  { href: '#surfaces', label: 'Surface classes', kind: 'internal' },
  { href: '#proof', label: 'Proof ceiling', kind: 'internal' },
  { href: DOCS_URL, label: 'Docs', kind: 'external' },
  { href: STATE_CONTRACT_URL, label: 'State Contract', kind: 'external' },
  { href: REFERENCES_URL, label: 'References', kind: 'external' },
  { href: BENCHMARK_URL, label: 'Benchmark Notes', kind: 'external' },
  { href: SIBLING_URL, label: 'Sibling: oh-my-copilot', kind: 'external' },
]

function NavLink({ item }: { item: NavItem }) {
  if (item.kind === 'internal') {
    return <Link href={item.href}>{item.label}</Link>
  }

  return (
    <a href={item.href} target="_blank" rel="noreferrer">
      {item.label}
    </a>
  )
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <div className="site-header-copy">
              <p className="eyebrow">canonical public root</p>
              <h1>oh-my-cursor — docs-first Cursor backbone</h1>
              <p className="site-intro">
                A repo-owned flagship landing surface that keeps docs, state boundaries,
                references, and benchmark notes visible while preserving the distinction between
                repo-owned proof and host-product-only Cursor capability.
              </p>
            </div>
            <div className="header-actions">
              <a className="button button-secondary" href={SIBLING_URL} target="_blank" rel="noreferrer">
                View sibling context
              </a>
              <a className="button button-primary" href={DOCS_URL} target="_blank" rel="noreferrer">
                Open repo docs
              </a>
            </div>
            <nav aria-label="Primary">
              <ul className="nav-list">
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} />
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  )
}
