# Roadmap

This roadmap is intentionally short. The extension is most useful when it stays fast, accurate, and focused on preventing HAProxy configuration mistakes.

Roadmap planning happens in public discussions:

- [Roadmap priorities](https://github.com/JuanTorchia/gmm-haproxy-vscode/discussions/25) — propose or rank future work.
- [HAProxy editing pain points](https://github.com/JuanTorchia/gmm-haproxy-vscode/discussions/26) — share real problems from editing configs in VS Code.
- [v0.3.0 planning](https://github.com/JuanTorchia/gmm-haproxy-vscode/discussions/27) — shape the next small milestone.

Actionable work is tracked as issues. See the [v0.3.0 milestone](https://github.com/JuanTorchia/gmm-haproxy-vscode/milestone/1) for the current candidate set.

## Current Status

- Syntax highlighting for HAProxy config files.
- Context-aware completion for sections, directives, actions, and common values.
- Version-aware validation for HAProxy 2.4, 2.6, 2.8, 3.0, and 3.1.
- Hover documentation with signatures and documentation links.
- Formatting, snippets, folding, symbols, go-to-definition, and quick fixes for deprecated directives.

## How Roadmap Decisions Are Made

Roadmap items should reduce real HAProxy configuration mistakes or make safe editing faster.

Good roadmap input includes:

- the HAProxy version in use
- a minimal sanitized config snippet
- the mistake, missing completion, confusing diagnostic, or missing documentation
- why the extension should catch or explain it inside VS Code

Maintainers turn repeated or clearly actionable feedback into focused issues. Broad ideas stay in Discussions until the user impact and acceptance criteria are clear.

## v0.3.0 Candidate Scope

- Improve directive metadata coverage where completions or hover docs are missing.
- Add version-specific validation tests for HAProxy 2.4, 2.6, 2.8, 3.0, and 3.1.
- Add sanitized fixtures for TLS termination, stick tables, routing, and health checks.
- Improve production-oriented snippets for common backend and frontend patterns.
- Keep README and Marketplace demos aligned with visible editor behavior.

## v1.0 Focus

- Improve directive coverage and version metadata accuracy.
- Expand real-world fixtures for HTTP, TCP, TLS, ACL, resolvers, peers, and stick-table configs.
- Keep diagnostics actionable and low-noise.
- Improve Marketplace presentation with up-to-date screenshots and concise demos.
- Keep CI reliable across Linux, Windows, and macOS.

## Contribution-Ready Work

- Add missing directive definitions with official HAProxy documentation links.
- Add validator tests for version-specific directives.
- Add real sanitized config fixtures.
- Improve snippets for common production patterns.
- Improve documentation for troubleshooting and local development.
- Improve README and Marketplace demos so more HAProxy users can discover the extension.

See [GOOD_FIRST_ISSUES.md](GOOD_FIRST_ISSUES.md) for starter tasks.

## Later Ideas

- Version change diagnostics that explain what breaks when switching HAProxy versions.
- Config diff tooling between HAProxy versions.
- More reference navigation for ACLs, maps, and backend references.
- Optional integration tests for larger real-world configs.
