# Changelog

All notable changes to HAProxy Config extension will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project scaffold with LSP architecture
- HAProxy config parser (fault-tolerant AST)
- Syntax highlighting via TextMate grammar
- Autocompletion (context-aware, section-filtered)
- Hover documentation with version badges
- Live validation with version-aware diagnostics
- Document formatting (4-space indentation normalization)
- Snippets for all common HAProxy blocks
- Multi-version support: 2.4 LTS, 2.6 LTS, 2.8 LTS, 3.0, 3.1
- Status bar version indicator with QuickPick selector
- GitHub Actions CI/CD pipeline
- Marketplace publish workflow on git tags
