const repoRoot = 'https://github.com/PeterPonyu/oh-my-cursor/blob/main'

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

export default function HomePage() {
  return (
    <div className="panel-stack">
      <section className="panel hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">canonical public root</p>
          <h2>oh-my-cursor keeps the landing surface truthful, local, and reviewable.</h2>
          <p>
            This homepage is a repo-owned evidence rail for the Cursor backbone. It makes
            checked-in proof visible, links directly to the docs that define the contract, and
            keeps host-product-only behavior distinct from what this repository actually ships.
          </p>
        </div>
        <div className="hero-actions">
          <a className="button button-primary" href={`${repoRoot}/README.md`} target="_blank" rel="noreferrer">
            Open repo docs
          </a>
          <a className="button" href="https://peterponyu.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">
            Compare sibling site
          </a>
        </div>
        <ul className="check-list compact-list">
          <li>This site is repo-owned and checked in under apps/cursor-backbone-site/.</li>
          <li>Cursor product capability remains host-product-only unless this repo ships proof artifacts.</li>
          <li>Unsupported-or-out-of-scope packaging stays visibly negative instead of implied support.</li>
        </ul>
      </section>

      <section id="evidence" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">required landing evidence links</p>
            <h2>Docs, state, references, and benchmark notes stay one click away.</h2>
          </div>
          <p>
            The landing surface exposes the evidence needed to audit public wording before trusting
            any stronger claim.
          </p>
        </div>
        <div className="card-grid evidence-grid">
          {evidenceLinks.map((item) => (
            <article key={item.title} className="panel nested-panel evidence-card">
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <a className="proof-link" href={item.href} target="_blank" rel="noreferrer">
                {item.href.replace('https://github.com/PeterPonyu/oh-my-cursor/blob/main/', '')}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="surfaces" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">surface classes</p>
            <h2>The public contract stays explicit about ownership.</h2>
          </div>
          <p>
            Every public sentence should preserve the difference between repo-owned,
            host-product-only, and unsupported-or-out-of-scope surfaces.
          </p>
        </div>
        <div className="triple-grid">
          {surfaceCards.map((card) => (
            <article key={card.title} className="panel nested-panel">
              <p className="badge-row">
                <span className="badge">{card.title}</span>
              </p>
              <h3>{card.heading}</h3>
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
            <h2>Proof class decides how far public wording may go.</h2>
          </div>
          <p>
            The repo remains useful by keeping the strongest proof visible and refusing silent
            upgrades from product capability to repo-owned behavior.
          </p>
        </div>
        <div className="card-grid proof-grid">
          {proofRails.map((rail) => (
            <article key={rail.title} className="panel nested-panel">
              <h3>{rail.title}</h3>
              <p>{rail.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel split-panel">
        <article className="panel nested-panel">
          <p className="eyebrow">validators</p>
          <h2>Local verification stays visible.</h2>
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
        <article className="panel nested-panel">
          <p className="eyebrow">sibling context</p>
          <h2>Compare the Copilot sibling without collapsing identity.</h2>
          <p>
            The sibling link exists for context and comparison only. It does not change the
            canonical identity root of oh-my-cursor, and it does not imply broader ownership than
            this repository can prove.
          </p>
          <a className="button" href="https://peterponyu.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">
            Sibling context: oh-my-copilot
          </a>
        </article>
      </section>
    </div>
  )
}
