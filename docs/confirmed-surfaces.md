# Confirmed Cursor-native surfaces

As of **April 21, 2026**, this repository backbone only relies on Cursor
surfaces that are clearly documented in official Cursor docs.

## 1. Root repository instructions

Official Cursor rules documentation describes `AGENTS.md` as a simple markdown
instruction surface and also notes current limitations: root-level only,
global scope, and a single file rather than a nested/scoped rules tree.

**How this repo uses that evidence:**
- keep one root `AGENTS.md`;
- avoid nested `AGENTS.md` assumptions; and
- put scoped behavior into `.cursor/rules/` instead.

## 2. Project rules in `.cursor/rules`

Official Cursor rules documentation describes project rules stored in
`.cursor/rules`, version-controlled, and scoped to the codebase.

**How this repo uses that evidence:**
- keep reusable repo policy in `.cursor/rules/*.mdc`;
- use an always-apply rule for global repo posture; and
- use a docs-focused rule for claim hygiene.

## 3. Cursor CLI consumes repo guidance

Official Cursor CLI documentation says the CLI agent supports the same rules
system as the editor and reads root `AGENTS.md` / `.cursor/rules` guidance.
The CLI docs also document MCP support and conversation resume behavior.

**How this repo uses that evidence:**
- treat this repo as a valid CLI workspace foundation;
- keep repo guidance at the root so CLI sessions can pick it up; and
- avoid claiming more than documented CLI behavior.

## 4. MCP is supported, but left opt-in here

Official Cursor docs document MCP support for both Cursor and the CLI.
However, a supportable backbone still needs a real server choice, auth model,
and proof path.

**How this repo uses that evidence:**
- acknowledge MCP as a real Cursor-native extension surface; but
- do not check in a default MCP configuration before a concrete server is
  selected.

## 5. Custom modes are a product capability

Official Cursor docs describe Agent, Ask, Manual, and Custom modes, with custom
modes configured in settings and tool/instruction selection handled by the
product.

**How this repo uses that evidence:**
- document custom modes as a capability worth using; but
- do not claim a repository file format for custom-mode packaging unless that
  format is explicitly documented.

## 6. Background agents are real, but not treated as a repo file surface

Official Cursor docs document background agents as a product feature.

**How this repo uses that evidence:**
- recognize background agents as part of the Cursor ecosystem; but
- avoid inventing a local repo provisioning story for them.

## Practical backbone decision

Given the confirmed surfaces above, the safest starting point for an
`oh-my-cursor` repository is:

1. root `AGENTS.md`;
2. `.cursor/rules/*.mdc`;
3. documentation that records what is confirmed vs inferred; and
4. opt-in MCP only after a specific integration is selected.
