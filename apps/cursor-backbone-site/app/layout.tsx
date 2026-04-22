import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'oh-my-cursor — docs-first Cursor backbone',
  description:
    'Flagship GitHub Pages landing surface for the oh-my-cursor docs-first, evidence-backed Cursor backbone.',
}

const NAV_ITEMS = [
  { href: '#evidence', label: 'Evidence' },
  { href: '#surfaces', label: 'Surface classes' },
  { href: '#proof', label: 'Proof ceiling' },
  { href: 'https://peterponyu.github.io/oh-my-copilot/', label: 'Sibling context: oh-my-copilot', external: true },
]

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <div className="brand-block">
              <p className="eyebrow">cursor backbone</p>
              <h1>oh-my-cursor</h1>
              <p className="lede">
                A repo-owned GitHub Pages landing surface for a docs-first, evidence-backed Cursor
                backbone.
              </p>
            </div>
            <nav aria-label="Primary">
              <ul className="nav-list">
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noreferrer">
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href}>{item.label}</Link>
                    )}
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
