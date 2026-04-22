const repoRoot = 'https://github.com/PeterPonyu/oh-my-cursor/blob/main'
const siblingSiteUrl = 'https://peterponyu.github.io/oh-my-copilot/'

const evidenceLinks = [
  {
    title: 'Docs',
    href: `${repoRoot}/README.md`,
    detail: 'Landing-level repo guidance and the ownership map for this Cursor-native backbone.',
  },
  {
    title: 'State Contract',
    href: `${repoRoot}/docs/state-contract.md`,
    detail: 'Checked-in boundary rules for repo-owned surfaces versus host-product-only user state.',
  },
  {
    title: 'References',
    href: `${repoRoot}/docs/references.md`,
    detail: 'Official-doc citations and access dates behind the public claims made by this repo.',
  },
  {
    title: 'Benchmark Notes',
    href: `${repoRoot}/benchmark/README.md`,
    detail: 'Reporting-comparable benchmark notes for this smaller, truthful Cursor contract.',
  },
]

const proofRails = [
  {
    title: 'checked-in-artifact',
    detail:
      'Use for repo-owned files this repository actually ships, such as AGENTS.md, .cursor/rules, validators, benchmark artifacts, and this Pages app.',
  },
  {
    title: 'official-doc',
    detail:
      'Use for Cursor product capabilities the host documents, such as CLI consumption of AGENTS.md, MCP support, modes, and background agents.',
  },
  {
    title: 'runtime-smoke',
    detail:
      'Use only when optional authenticated smoke checks succeed; never let runtime possibility silently inflate checked-in ownership claims.',
  },
]

const surfaceCards = [
  {
    title: 'repo-owned',
    heading: 'Checked-in surfaces this repo ships and can validate',
    bullets: [
      'apps/cursor-backbone-site/ as a repo-owned public site surface',
      'Root AGENTS.md, .cursor/rules, bounded docs, and validators',
      'Benchmark artifacts that record checked-in evidence for the canonical repo root',
    ],
  },
  {
    title: 'host-product-only',
    heading: 'Real Cursor capabilities that the product owns',
    bullets: [
      'Cursor CLI auth and default model availability in the user environment',
      'Product-managed MCP support, modes, and background agents',
      'Runtime session state and other host-managed surfaces outside this repo',
    ],
  },
  {
    title: 'unsupported-or-out-of-scope',
    heading: 'Surfaces this repo intentionally does not claim today',
    bullets: [
      'Checked-in plugin, hook, prompt, skill, or custom-agent packaging',
      'Repo-file custom mode configuration or repo-file background-agent provisioning',
      'A default repo-owned .cursor/mcp.json or repo-owned product packaging claims',
    ],
  },
]

const validatorLinks = [
  {
    title: 'verify-backbone.sh',
    href: `${repoRoot}/scripts/verify-backbone.sh`,
  },
  {
    title: 'validate-surface-visibility.sh',
    href: `${repoRoot}/scripts/validate-surface-visibility.sh`,
  },
  {
    title: 'validate-state-contract.sh',
    href: `${repoRoot}/scripts/validate-state-contract.sh`,
  },
  {
    title: 'check-default-auth.sh',
    href: `${repoRoot}/scripts/check-default-auth.sh`,
  },
]

const landingChecks = [
  'The hero, metadata, and primary heading all lead with oh-my-cursor.',
  'Docs, State Contract, References, and Benchmark Notes stay visible from the landing surface.',
  'Sibling navigation points to oh-my-copilot as comparison context rather than canonical ownership.',
  'repo-owned, host-product-only, and unsupported-or-out-of-scope stay visibly distinct.',
]

export default function HomePage() {
  return (
    <div className="panel-stack">
      <section className="panel hero-panel hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">landing overview</p>
          <h2>Truthful flagship styling without broadening the contract.</h2>
          <p>
            <strong>oh-my-cursor</strong> uses this landing surface as its canonical public root.
            The visual system is intentionally sibling-consistent with oh-my-copilot, but the
            content remains Cursor-native, docs-first, and explicit about what this repository
            actually owns.
          </p>
          <p>
            Checked-in proof stays visible, host-product-only behavior stays bounded, and
            unsupported-or-out-of-scope packaging remains negative rather than implied support.
          </p>
          <div className="action-row">
            <a className="button button-primary" href={`${repoRoot}/README.md`} target="_blank" rel="noreferrer">
              Open repo docs
            </a>
            <a className="button button-secondary" href={`${repoRoot}/docs/state-contract.md`} target="_blank" rel="noreferrer">
              Read state contract
            </a>
            <a className="button button-secondary" href={siblingSiteUrl} target="_blank" rel="noreferrer">
              Visit sibling site
            </a>
          </div>
        </div>

        <div className="hero-aside panel panel-inset">
          <p className="eyebrow">current public-graph checks</p>
          <ul className="check-list compact-list">
            {landingChecks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section id="evidence" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">required landing evidence links</p>
            <h3>Docs, state, references, and benchmark notes stay one click away.</h3>
          </div>
          <p>
            The flagship landing surface exposes the repo-owned evidence needed to audit public
            wording before trusting stronger claims.
          </p>
        </div>
        <div className="link-grid">
          {evidenceLinks.map((item) => (
            <article key={item.title} className="panel panel-inset link-card">
              <h4>{item.title}</h4>
              <p>{item.detail}</p>
              <a className="text-link" href={item.href} target="_blank" rel="noreferrer">
                Open {item.title}
              </a>
            </article>
          ))}
          <article className="panel panel-inset link-card">
            <h4>Sibling context: oh-my-copilot</h4>
            <p>
              Compare the Copilot sibling homepage as context only; it is not the canonical identity
              root for oh-my-cursor.
            </p>
            <a className="text-link" href={siblingSiteUrl} target="_blank" rel="noreferrer">
              Open sibling site
            </a>
          </article>
        </div>
      </section>

      <section id="surfaces" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">surface classes</p>
            <h3>The public contract stays explicit about ownership.</h3>
          </div>
          <p>
            Every public sentence should preserve the difference between repo-owned,
            host-product-only, and unsupported-or-out-of-scope surfaces.
          </p>
        </div>
        <div className="triple-grid">
          {surfaceCards.map((card) => (
            <article key={card.title} className="panel panel-inset">
              <p className="badge-row">
                <span className="badge">{card.title}</span>
              </p>
              <h4>{card.heading}</h4>
              <ul className="check-list compact-list">
                {card.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="proof" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">proof ceiling</p>
            <h3>Proof class decides how far public wording may go.</h3>
          </div>
          <p>
            The repo stays useful by making the strongest available proof visible and refusing silent
            upgrades from product capability to repo-owned behavior.
          </p>
        </div>
        <div className="card-grid">
          {proofRails.map((rail) => (
            <article key={rail.title} className="panel panel-inset">
              <h4>{rail.title}</h4>
              <p>{rail.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel two-column-grid">
        <article className="panel panel-inset">
          <p className="eyebrow">validators</p>
          <h3>Local verification stays visible.</h3>
          <ul className="check-list compact-list">
            {validatorLinks.map((item) => (
              <li key={item.title}>
                <a className="proof-link" href={item.href} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel panel-inset">
          <p className="eyebrow">sibling context</p>
          <h3>Shared flagship rhythm, repo-specific boundaries.</h3>
          <p>
            The sibling link exists for context and comparison only. It does not change the
            canonical identity root of oh-my-cursor, and it does not imply broader ownership than
            this repository can prove.
          </p>
          <a className="button button-secondary" href={siblingSiteUrl} target="_blank" rel="noreferrer">
            Sibling context: oh-my-copilot
          </a>
        </article>
      </section>
    </div>
  )
}
