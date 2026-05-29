import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const TARGET_DIRS = [
  path.join(ROOT, 'apps', 'cursor-backbone-site', 'out'),
  path.join(ROOT, 'apps', 'cursor-backbone-site', '.next'),
];

const REPLACEMENTS: [string | RegExp, string][] = [
  // Brand independence robust updates (for SSR bundles and Next.js artifacts)
  [/sibling-context navigation/g, 'evidence-based navigation'],
  [/Visit sibling site/g, 'Read references'],
  [/Sibling context: oh-my-cursor/g, 'MCP State Bridge'],
  [/Sibling context: oh-my-copilot/g, 'MCP State Bridge'],
  [
    'Compare the Copilot sibling homepage as context only; it is not the canonical identity root for oh-my-cursor.',
    'Opt-in local model context protocol bridge for agent-callable workflow-state reads and writes.'
  ],
  [/Open sibling site/g, 'Open MCP Docs'],
  [/Shared flagship rhythm, repo-specific boundaries\./g, 'Opt-in, local, and file-backed contract.'],
  [
    'The sibling link exists for context and comparison only. It does not change the canonical identity root of oh-my-cursor, and it does not imply broader ownership than this repository can prove.',
    'Orchestrate local intake, planning, execution, and verification phases without background daemons. The workflow status is kept in .cursor/state/workflow-state.json and can be verified anytime.'
  ],
  [/sibling context/g, 'workflow state'],

  // 1. Header secondary button ("View sibling context")
  // HTML Format
  [
    'href="https://peterponyu.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">View sibling context',
    'href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/.cursor/state/workflow-state.schema.json" target="_blank" rel="noreferrer">View state schema',
  ],
  [
    'href="https://oh-my-cursor.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">View sibling context',
    'href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/.cursor/state/workflow-state.schema.json" target="_blank" rel="noreferrer">View state schema',
  ],
  // Unescaped JSON Format
  [
    '"href":"https://peterponyu.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"View sibling context"',
    '"href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/.cursor/state/workflow-state.schema.json","target":"_blank","rel":"noreferrer","children":"View state schema"',
  ],
  [
    '"href":"https://oh-my-cursor.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"View sibling context"',
    '"href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/.cursor/state/workflow-state.schema.json","target":"_blank","rel":"noreferrer","children":"View state schema"',
  ],
  // Escaped JSON Format
  [
    '\\"href\\":\\"https://peterponyu.github.io/oh-my-copilot/\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"View sibling context\\"',
    '\\"href\\":\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/.cursor/state/workflow-state.schema.json\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"View state schema\\"',
  ],
  [
    '\\"href\\":\\"https://oh-my-cursor.github.io/oh-my-copilot/\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"View sibling context\\"',
    '\\"href\\":\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/.cursor/state/workflow-state.schema.json\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"View state schema\\"',
  ],

  // 2. Navigation link ("Sibling: oh-my-copilot")
  // HTML Format
  [
    'href="https://peterponyu.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Sibling: oh-my-copilot',
    'href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md" target="_blank" rel="noreferrer">MCP Bridge',
  ],
  [
    'href="https://oh-my-cursor.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Sibling: oh-my-copilot',
    'href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md" target="_blank" rel="noreferrer">MCP Bridge',
  ],
  // Unescaped JSON Format
  [
    '"href":"https://peterponyu.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Sibling: oh-my-copilot"',
    '"href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md","target":"_blank","rel":"noreferrer","children":"MCP Bridge"',
  ],
  [
    '"href":"https://oh-my-cursor.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Sibling: oh-my-copilot"',
    '"href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md","target":"_blank","rel":"noreferrer","children":"MCP Bridge"',
  ],
  // Escaped JSON Format
  [
    '\\"href\\":\\"https://peterponyu.github.io/oh-my-copilot/\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"Sibling: oh-my-copilot\\"',
    '\\"href\\":\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"MCP Bridge\\"',
  ],
  [
    '\\"href\\":\\"https://oh-my-cursor.github.io/oh-my-copilot/\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"Sibling: oh-my-copilot\\"',
    '\\"href\\":\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"MCP Bridge\\"',
  ],

  // 3. Visit sibling site button under Hero
  // HTML Format
  [
    'href="https://peterponyu.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Visit sibling site',
    'href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/references.md" target="_blank" rel="noreferrer">Read references',
  ],
  [
    'href="https://oh-my-cursor.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Visit sibling site',
    'href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/references.md" target="_blank" rel="noreferrer">Read references',
  ],
  // Unescaped JSON Format
  [
    '"href":"https://peterponyu.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Visit sibling site"',
    '"href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/references.md","target":"_blank","rel":"noreferrer","children":"Read references"',
  ],
  [
    '"href":"https://oh-my-cursor.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Visit sibling site"',
    '"href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/references.md","target":"_blank","rel":"noreferrer","children":"Read references"',
  ],
  // Escaped JSON Format
  [
    '\\"href\\":\\"https://peterponyu.github.io/oh-my-copilot/\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"Visit sibling site\\"',
    '\\"href\\":\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/references.md\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"Read references\\"',
  ],
  [
    '\\"href\\":\\"https://oh-my-cursor.github.io/oh-my-copilot/\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"Visit sibling site\\"',
    '\\"href\\":\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/references.md\\",\\"target\\":\\"_blank\\",\\"rel\\":\\"noreferrer\\",\\"children\\":\\"Read references\\"',
  ],

  // 4. Hero introduction text
  [
    'The visual system is intentionally sibling-consistent with oh-my-copilot, but the content remains Cursor-native, docs-first, and explicit about what this repository actually owns.',
    'The content remains Cursor-native, docs-first, and explicit about what this repository actually owns.',
  ],

  // 5. Hero checklist item
  [
    '<li>Sibling navigation points to oh-my-copilot as comparison context rather than canonical ownership.</li>',
    '<li>All references and confirmations are backed by checked-in proof and official docs.</li>',
  ],
  [
    'Sibling navigation points to oh-my-copilot as comparison context rather than canonical ownership.',
    'All references and confirmations are backed by checked-in proof and official docs.',
  ],

  // 6. Evidence Grid link card
  // HTML Format
  [
    '<h4>Sibling context: oh-my-copilot</h4><p>Compare the Copilot sibling homepage as context only; it is not the canonical identity root for oh-my-cursor.</p><a class="text-link" href="https://peterponyu.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Open sibling site</a>',
    '<h4>MCP State Bridge</h4><p>Opt-in local model context protocol bridge for agent-callable workflow-state reads and writes.</p><a class="text-link" href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md" target="_blank" rel="noreferrer">Open MCP Docs</a>',
  ],
  [
    '<h4>Sibling context: oh-my-copilot</h4><p>Compare the Copilot sibling homepage as context only; it is not the canonical identity root for oh-my-cursor.</p><a class="text-link" href="https://oh-my-cursor.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Open sibling site</a>',
    '<h4>MCP State Bridge</h4><p>Opt-in local model context protocol bridge for agent-callable workflow-state reads and writes.</p><a class="text-link" href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md" target="_blank" rel="noreferrer">Open MCP Docs</a>',
  ],
  // Unescaped JSON Format
  [
    '"h4",null,{"children":"Sibling context: oh-my-copilot"}],["$","p",null,{"children":"Compare the Copilot sibling homepage as context only; it is not the canonical identity root for oh-my-cursor."}],["$","a",null,{"className":"text-link","href":"https://peterponyu.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Open sibling site"}',
    '"h4",null,{"children":"MCP State Bridge"}],["$","p",null,{"children":"Opt-in local model context protocol bridge for agent-callable workflow-state reads and writes."}],["$","a",null,{"className":"text-link","href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md","target":"_blank","rel":"noreferrer","children":"Open MCP Docs"}',
  ],
  [
    '"h4",null,{"children":"Sibling context: oh-my-copilot"}],["$","p",null,{"children":"Compare the Copilot sibling homepage as context only; it is not the canonical identity root for oh-my-cursor."}],["$","a",null,{"className":"text-link","href":"https://oh-my-cursor.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Open sibling site"}',
    '"h4",null,{"children":"MCP State Bridge"}],["$","p",null,{"children":"Opt-in local model context protocol bridge for agent-callable workflow-state reads and writes."}],["$","a",null,{"className":"text-link","href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md","target":"_blank","rel":"noreferrer","children":"Open MCP Docs"}',
  ],
  // Escaped JSON Format
  [
    '\\\"h4\\\",null,{\\\"children\\\":\\\"Sibling context: oh-my-copilot\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"Compare the Copilot sibling homepage as context only; it is not the canonical identity root for oh-my-cursor.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"text-link\\\",\\\"href\\\":\\\"https://peterponyu.github.io/oh-my-copilot/\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Open sibling site\\\"}',
    '\\\"h4\\\",null,{\\\"children\\\":\\\"MCP State Bridge\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"Opt-in local model context protocol bridge for agent-callable workflow-state reads and writes.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"text-link\\\",\\\"href\\\":\\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Open MCP Docs\\\"}',
  ],
  [
    '\\\"h4\\\",null,{\\\"children\\\":\\\"Sibling context: oh-my-copilot\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"Compare the Copilot sibling homepage as context only; it is not the canonical identity root for oh-my-cursor.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"text-link\\\",\\\"href\\\":\\\"https://oh-my-cursor.github.io/oh-my-copilot/\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Open sibling site\\\"}',
    '\\\"h4\\\",null,{\\\"children\\\":\\\"MCP State Bridge\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"Opt-in local model context protocol bridge for agent-callable workflow-state reads and writes.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"text-link\\\",\\\"href\\\":\\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/mcp-bridge.md\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Open MCP Docs\\\"}',
  ],

  // 7. Bottom section card
  // HTML Format
  [
    '<p class="eyebrow">sibling context</p><h3>Shared flagship rhythm, repo-specific boundaries.</h3><p>The sibling link exists for context and comparison only. It does not change the canonical identity root of oh-my-cursor, and it does not imply broader ownership than this repository can prove.</p><a class="button button-secondary" href="https://peterponyu.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Sibling context: oh-my-copilot</a>',
    '<p class="eyebrow">workflow state</p><h3>Opt-in, local, and file-backed contract.</h3><p>Orchestrate local intake, planning, execution, and verification phases without background daemons. The workflow status is kept in .cursor/state/workflow-state.json and can be verified anytime.</p><a class="button button-secondary" href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/state-contract.md" target="_blank" rel="noreferrer">Read state contract</a>',
  ],
  [
    '<p class="eyebrow">sibling context</p><h3>Shared flagship rhythm, repo-specific boundaries.</h3><p>The sibling link exists for context and comparison only. It does not change the canonical identity root of oh-my-cursor, and it does not imply broader ownership than this repository can prove.</p><a class="button button-secondary" href="https://oh-my-cursor.github.io/oh-my-copilot/" target="_blank" rel="noreferrer">Sibling context: oh-my-copilot</a>',
    '<p class="eyebrow">workflow state</p><h3>Opt-in, local, and file-backed contract.</h3><p>Orchestrate local intake, planning, execution, and verification phases without background daemons. The workflow status is kept in .cursor/state/workflow-state.json and can be verified anytime.</p><a class="button button-secondary" href="https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/state-contract.md" target="_blank" rel="noreferrer">Read state contract</a>',
  ],
  // Unescaped JSON Format
  [
    '"p",null,{"className":"eyebrow","children":"sibling context"}],["$","h3",null,{"children":"Shared flagship rhythm, repo-specific boundaries."}],["$","p",null,{"children":"The sibling link exists for context and comparison only. It does not change the canonical identity root of oh-my-cursor, and it does not imply broader ownership than this repository can prove."}],["$","a",null,{"className":"button button-secondary","href":"https://peterponyu.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Sibling context: oh-my-copilot"}',
    '"p",null,{"className":"eyebrow","children":"workflow state"}],["$","h3",null,{"children":"Opt-in, local, and file-backed contract."}],["$","p",null,{"children":"Orchestrate local intake, planning, execution, and verification phases without background daemons. The workflow status is kept in .cursor/state/workflow-state.json and can be verified anytime."}],["$","a",null,{"className":"button button-secondary","href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/state-contract.md","target":"_blank","rel":"noreferrer","children":"Read state contract"}',
  ],
  [
    '"p",null,{"className":"eyebrow","children":"sibling context"}],["$","h3",null,{"children":"Shared flagship rhythm, repo-specific boundaries."}],["$","p",null,{"children":"The sibling link exists for context and comparison only. It does not change the canonical identity root of oh-my-cursor, and it does not imply broader ownership than this repository can prove."}],["$","a",null,{"className":"button button-secondary","href":"https://oh-my-cursor.github.io/oh-my-copilot/","target":"_blank","rel":"noreferrer","children":"Sibling context: oh-my-copilot"}',
    '"p",null,{"className":"eyebrow","children":"workflow state"}],["$","h3",null,{"children":"Opt-in, local, and file-backed contract."}],["$","p",null,{"children":"Orchestrate local intake, planning, execution, and verification phases without background daemons. The workflow status is kept in .cursor/state/workflow-state.json and can be verified anytime."}],["$","a",null,{"className":"button button-secondary","href":"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/state-contract.md","target":"_blank","rel":"noreferrer","children":"Read state contract"}',
  ],
  // Escaped JSON Format
  [
    '\\\"p\\\",null,{\\\"className\\\":\\\"eyebrow\\\",\\\"children\\\":\\\"sibling context\\\"}],[$\\\",\\\"h3\\\",null,{\\\"children\\\":\\\"Shared flagship rhythm, repo-specific boundaries.\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"The sibling link exists for context and comparison only. It does not change the canonical identity root of oh-my-cursor, and it does not imply broader ownership than this repository can prove.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"button button-secondary\\\",\\\"href\\\":\\\"https://peterponyu.github.io/oh-my-copilot/\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Sibling context: oh-my-copilot\\\"}',
    '\\\"p\\\",null,{\\\"className\\\":\\\"eyebrow\\\",\\\"children\\\":\\\"workflow state\\\"}],[$\\\",\\\"h3\\\",null,{\\\"children\\\":\\\"Opt-in, local, and file-backed contract.\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"Orchestrate local intake, planning, execution, and verification phases without background daemons. The workflow status is kept in .cursor/state/workflow-state.json and can be verified anytime.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"button button-secondary\\\",\\\"href\\\":\\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/state-contract.md\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Read state contract\\\"}',
  ],
  [
    '\\\"p\\\",null,{\\\"className\\\":\\\"eyebrow\\\",\\\"children\\\":\\\"sibling context\\\"}],[$\\\",\\\"h3\\\",null,{\\\"children\\\":\\\"Shared flagship rhythm, repo-specific boundaries.\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"The sibling link exists for context and comparison only. It does not change the canonical identity root of oh-my-cursor, and it does not imply broader ownership than this repository can prove.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"button button-secondary\\\",\\\"href\\\":\\\"https://oh-my-cursor.github.io/oh-my-copilot/\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Sibling context: oh-my-copilot\\\"}',
    '\\\"p\\\",null,{\\\"className\\\":\\\"eyebrow\\\",\\\"children\\\":\\\"workflow state\\\"}],[$\\\",\\\"h3\\\",null,{\\\"children\\\":\\\"Opt-in, local, and file-backed contract.\\\"}],[$\\\",\\\"p\\\",null,{\\\"children\\\":\\\"Orchestrate local intake, planning, execution, and verification phases without background daemons. The workflow status is kept in .cursor/state/workflow-state.json and can be verified anytime.\\\"}],[$\\\",\\\"a\\\",null,{\\\"className\\\":\\\"button button-secondary\\\",\\\"href\\\":\\\"https://github.com/PeterPonyu/oh-my-cursor/blob/main/docs/state-contract.md\\\",\\\"target\\\":\\\"_blank\\\",\\\"rel\\\":\\\"noreferrer\\\",\\\"children\\\":\\\"Read state contract\\\"}',
  ],

  // 8. Fallback global replacement for leftover sibling context links/keys.
  //    NOTE: The canonical repo owner is `PeterPonyu` and the canonical
  //    GitHub Pages origin is `peterponyu.github.io/oh-my-cursor`, so we must
  //    NOT rewrite `github.com/PeterPonyu` or `peterponyu.github.io` here —
  //    doing so previously pointed users at the nonexistent `oh-my-cursor`
  //    org and the unpublished `oh-my-cursor.github.io` site (both 404).
  [/oh-my-copilot/gi, 'oh-my-cursor'],
];

const VALID_EXTS = ['.html', '.js', '.txt', '.rsc', '.json', '.css'];

function processFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (!VALID_EXTS.includes(ext)) return;

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    console.error(`Error reading ${filePath}: ${err.message}`);
    return;
  }

  let modified = false;
  let newContent = content;

  for (const [target, replacement] of REPLACEMENTS) {
    if (typeof target === 'string') {
      if (newContent.includes(target)) {
        newContent = newContent.split(target).join(replacement);
        modified = true;
      }
    } else if (target instanceof RegExp) {
      if (target.test(newContent)) {
        newContent = newContent.replace(target, replacement);
        modified = true;
      }
    }
  }

  if (modified) {
    try {
      fs.writeFileSync(filePath, newContent, 'utf-8');
      console.log(`Refined branding in: ${path.relative(ROOT, filePath)}`);
    } catch (err: any) {
      console.error(`Error writing ${filePath}: ${err.message}`);
    }
  }
}

function walkDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkDir(full);
    } else if (stat.isFile()) {
      processFile(full);
    }
  }
}

function main() {
  console.log('Starting branding refinement scan...');
  for (const dir of TARGET_DIRS) {
    console.log(`Scanning directory: ${path.relative(ROOT, dir)}`);
    walkDir(dir);
  }
  console.log('Branding refinement complete.');
}

main();
