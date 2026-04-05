# CLAUDE.md — VSCode Extension: HAProxy Config Support

## Project Overview
A VSCode extension that provides full language support for HAProxy configuration files,
including syntax highlighting, autocompletion, snippets, validation, hover docs, and formatting.
The extension must support multiple HAProxy versions for validation purposes.

---

# PART I — SOFTWARE ARCHITECTURE

## Architectural Principles

### Separation of Concerns
- **Client** (extension host): activates the language server, forwards configuration, registers commands. Zero business logic.
- **Server** (language server): owns all language intelligence — parsing, validation, completion, hover, formatting.
- **Data layer** (`server/src/data/`): pure JSON definitions of HAProxy directives per version. No code, no logic — data only.
- **Parser** (`server/src/parser/`): transforms raw text into a typed AST. Has no knowledge of VSCode or LSP.
- **Providers** (`server/src/completion/`, `hover/`, `validation/`, `formatting/`): each provider receives an AST and returns LSP-typed results. No cross-provider dependencies.

### LSP Architecture (mandatory)
- Use the **Language Server Protocol** pattern — client/server split over stdio or IPC.
- Client uses `vscode-languageclient`. Server uses `vscode-languageserver`.
- Never run parser, validator, or any language logic in the extension host process.
- Language server must be runnable standalone (without VSCode) for testing purposes.

### Dependency Direction
```
VSCode API
    ↓
client/extension.ts        ← only imports vscode + vscode-languageclient
    ↓ (IPC)
server/server.ts           ← only imports vscode-languageserver-*
    ↓
parser → AST
    ↓
providers (completion, hover, validation, formatting)
    ↓
data/haproxy-{version}.json
```
Dependencies must flow downward only. No circular imports. No provider importing from another provider.

### AST Design
- Parse into a typed AST: `HaproxyDocument → Section[] → Directive[]`.
- Every AST node carries its source range (`{ line, character, length }`) for diagnostics and hover.
- Parser is fault-tolerant: partial or broken configs must still produce a partial AST.
- AST is immutable after construction — providers read it, never mutate it.
- Cache AST per document URI. Invalidate on `textDocument/didChange`.

### Version Strategy
- Directive definitions are stored per-version as flat JSON files: `data/2.4.json`, `data/2.6.json`, etc.
- A `VersionRegistry` class merges base version data with incremental changes.
- Fallback rule: if version X is requested and not found, use the nearest lower known version.
- Deprecation is tracked in the data files, not in code.

### Project Structure
```
gmm-haproxy-vscode/
├── client/
│   ├── src/
│   │   └── extension.ts
│   ├── package.json
│   └── tsconfig.json
├── server/
│   ├── src/
│   │   ├── server.ts
│   │   ├── parser/
│   │   │   ├── lexer.ts
│   │   │   ├── parser.ts
│   │   │   └── ast.ts
│   │   ├── validation/
│   │   │   ├── validator.ts
│   │   │   └── rules/
│   │   ├── completion/
│   │   │   └── completionProvider.ts
│   │   ├── hover/
│   │   │   └── hoverProvider.ts
│   │   ├── formatting/
│   │   │   └── formatter.ts
│   │   ├── registry/
│   │   │   └── versionRegistry.ts
│   │   └── data/
│   │       ├── 2.4.json
│   │       ├── 2.6.json
│   │       ├── 2.8.json
│   │       ├── 3.0.json
│   │       └── 3.1.json
│   ├── package.json
│   └── tsconfig.json
├── syntaxes/
│   └── haproxy.tmLanguage.json
├── snippets/
│   └── haproxy.json
├── schemas/
│   └── haproxy-versions.json
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── publish.yml
├── test/
│   ├── fixtures/          # real HAProxy config files
│   ├── parser/
│   ├── validator/
│   └── integration/
├── .vscodeignore
├── .eslintrc.json
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

### Design Patterns to Use
- **Registry pattern** for directive version data — single source of truth, queried by version.
- **Provider pattern** for language features — each feature is an isolated class implementing an interface.
- **Strategy pattern** for validation rules — each rule is a function `(directive, context) => Diagnostic[]`.
- **Observer pattern** via LSP events — server reacts to document open/change/close events.
- **Immutable value objects** for AST nodes — never mutate after creation.

### Design Patterns to Avoid
- God objects — no single class owns parsing + validation + completion + state.
- Shared mutable state between LSP request handlers.
- Inheritance chains deeper than 2 levels.
- Factory methods that branch on string literals — use a registry/map instead.

---

# PART II — ENGINEERING PRACTICES

## TypeScript
- `"strict": true` in every `tsconfig.json`. No exceptions.
- Target `ES2022`, module `commonjs` (required by VSCode extension host and language server).
- Never use `any`. Use `unknown` + type narrowing if the shape is uncertain.
- Prefer `interface` over `type` for object shapes that may be extended.
- Use `readonly` on all AST node fields.
- All `Promise`-returning functions must be `async` — no `.then()` chains.
- Unhandled promise rejections crash the extension host. Every async path must have `try/catch` or `.catch()`.
- Use `Disposable` pattern: register every subscription in `context.subscriptions`.

## Code Quality
- ESLint with `@typescript-eslint` — enforce on every save (CI blocks merge on lint errors).
- No `console.log` in production code. Use `connection.console.log()` server-side.
- Max file length: 300 lines. If a file grows beyond that, split by responsibility.
- Max function length: 40 lines. Long functions are a refactor signal.
- No magic strings. Directive names, section names, setting keys → constants or enums.
- All exported symbols must have JSDoc with `@param` and `@returns`.
- Dead code is deleted, not commented out.

## Testing
- Unit tests for: parser, validator, completion provider, hover provider, formatter — all independent of VSCode.
- Integration tests using `@vscode/test-electron` for extension activation and LSP handshake.
- Test fixtures: minimum 5 real HAProxy configs (simple, complex, multi-backend, SSL termination, TCP proxy).
- Each HAProxy version (2.4, 2.6, 2.8, 3.0, 3.1) must have dedicated validation tests.
- Snapshot tests for the TextMate grammar — catch tokenization regressions.
- Coverage target: 80% on parser and validator modules.
- Tests run on every PR via GitHub Actions. Merge blocked if tests fail.

## Performance Targets
| Metric | Target |
|---|---|
| Extension activation time | < 500ms |
| Language server startup | < 1s |
| Parse 1000-line config | < 100ms |
| Completion response | < 50ms |
| Diagnostic update (debounce) | 300–500ms after last keystroke |
- Measure activation time with VSCode Extension Host DevTools.
- Profile with `node --inspect` if any target is missed.
- AST cache prevents re-parsing unchanged documents.

## Build & Bundling
- Use `esbuild` to bundle the language server into a single file for packaging.
- Separate bundles for client and server — they run in different processes.
- Source maps in development, stripped in production bundle.
- `npm run compile` = TypeScript type-check only (no emit, catches type errors fast).
- `npm run build` = esbuild bundle for packaging.
- `npm run watch` = esbuild watch mode for development.

## Dependency Management
- Zero runtime dependencies in the client beyond `vscode-languageclient`.
- Server runtime dependencies: only `vscode-languageserver-*` packages.
- All other packages are `devDependencies`.
- Never add a dependency for something that can be written in < 30 lines. No lodash, no utility libraries.
- Lock file (`package-lock.json`) committed. Never delete it.
- Audit dependencies on every release: `npm audit --audit-level=high`.

## Git Workflow
- Branch naming: `feat/description`, `fix/description`, `chore/description`.
- Commit message format: `type(scope): short description` (Conventional Commits).
  - Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`.
  - Example: `feat(completion): add context-aware backend name suggestions`
- Every commit must pass: lint + type-check + unit tests.
- Squash commits on merge to main.
- Tags trigger the publish workflow: `v1.0.0`, `v1.1.0`, etc.
- All commits authored as **Juan Torchia <j.s.torchia@gmail.com>**. No Claude co-author trailers.

---

# PART III — PRODUCT PRINCIPLES

## User-Centered Design
- The primary user is a **DevOps/SRE/Platform engineer** editing HAProxy configs in VSCode.
  - They know HAProxy well but may not remember every directive's exact syntax.
  - They work on production load balancers — errors in config are high-stakes.
  - They value speed and accuracy over visual polish.
- Every feature decision must answer: *does this reduce a mistake a user could make in production?*
- Features that add noise without reducing errors are not shipped.

## Feature Prioritization (MoSCoW)
**Must have (v1.0):**
- Syntax highlighting
- Autocompletion (section-aware)
- Inline validation with error/warning diagnostics
- Hover documentation
- Multi-version support (2.4 → 3.1)

**Should have (v1.x):**
- Snippets for common patterns
- Document formatter
- Go-to-definition for backend/frontend references
- "What changed in this version" diagnostics when switching versions

**Could have (v2.x):**
- Config diff tool between two HAProxy versions
- Integration with HAProxy stats socket (live backend status)
- Config template wizard

**Won't have:**
- Runtime execution of HAProxy
- Remote file editing
- GUI configuration panels

## Release Strategy
- v0.x: internal development, no marketplace publish.
- v1.0: first public release — must have all Must-have features + README + CI.
- Semantic versioning strictly: MAJOR.MINOR.PATCH.
- Changelog maintained in `CHANGELOG.md` following Keep a Changelog format.
- Release notes written in English for marketplace; translated to Spanish in GitHub release body.

## Metrics for Success
- Marketplace install count and rating.
- GitHub issues: ratio of feature requests vs bugs (higher feature requests = product-market fit).
- Zero critical bugs (P0) open for more than 48h.
- Extension activates without error on first install (no missing steps, no manual config).

---

# PART IV — INFORMATION SECURITY

## Threat Model for a VSCode Extension
A VSCode extension runs with the same OS-level permissions as the VSCode process.
It has access to the file system, environment variables, and the network.
This makes security hygiene mandatory, not optional.

## Input Handling
- **Never trust user-provided config content.** Treat every HAProxy config file as untrusted input.
- All regex applied to config content must have explicit length limits — protect against ReDoS.
  - Test regexes with `safe-regex` or manually verify backtracking behavior.
  - Prefer linear-time parsing over regex for complex patterns.
- Never `eval()` or `new Function()` any content derived from the config file.
- Never use `innerHTML` or inject config content into a webview without sanitization.

## Dependency Security
- Run `npm audit` before every release. Block publish if HIGH or CRITICAL vulnerabilities exist.
- Pin all direct dependencies to exact versions in `package.json` (use `"1.2.3"` not `"^1.2.3"` for direct deps).
- Transitive dependencies are locked via `package-lock.json`.
- Dependabot or Renovate configured to auto-PR dependency updates weekly.
- Never add a dependency without reviewing its source and download count.

## Secrets & Sensitive Data
- The extension must never read, log, or transmit environment variables, SSH keys, or tokens.
- No telemetry without explicit user opt-in.
- If telemetry is added in the future: opt-in only, no PII, no file content, no config values.
- Do not store any user data outside of VSCode's `ExtensionContext.globalState` / `workspaceState`.

## Webview Security (if used in future)
- Content Security Policy (CSP) must be set on every webview: `default-src 'none'`.
- Use `webview.asWebviewUri()` for all local resource URIs — never raw `file://` paths.
- Never pass file content from the extension host to a webview as raw HTML.
- Message passing between webview and extension host: validate message shape with a type guard before acting on it.

## Supply Chain
- Only publish from CI (GitHub Actions), never from a local machine.
- The publish token (`VSCE_PAT`) is stored in GitHub Actions secrets only — never in code or `.env` files.
- The publish workflow only triggers on signed tags (`v*.*.*`), not on arbitrary pushes.
- Review the `vsce ls` output before every publish to confirm no sensitive files are bundled.

## Extension Permissions (package.json)
- Do not request capabilities the extension doesn't need.
- Do not use `"*"` activation event — activate only on `onLanguage:haproxy`.
- Do not register URI handlers unless needed.
- Do not use `vscode.workspace.fs` to read files outside of the documents the user opened.

## Static Analysis
- ESLint security plugin (`eslint-plugin-security`) included in dev dependencies — run in CI.
- No `child_process.exec()` with user-controlled strings. If shell execution is ever needed, use `execFile()` with an explicit argument array.
- Grep for these patterns in CI and fail the build if found: `eval(`, `new Function(`, `innerHTML`, `dangerouslySetInnerHTML`.

---

# PART V — INTERFACE & UX (VSCode Extension)

## VSCode UX Principles
VSCode users expect extensions to be **invisible when not needed** and **instant when needed**.
The extension must feel like a natural part of the editor, not a plugin bolted on.

### Rule 1: Don't Break the Editor
- Extension activation must never throw an unhandled error — wrap `activate()` in try/catch and log to output channel on failure.
- If the language server crashes, show a single actionable notification: "HAProxy language server crashed. [Restart] [Show Logs]".
- Never show modal dialogs (`vscode.window.showInformationMessage` with buttons is fine; `showWarningMessage` modal is not for routine errors).
- Never modify the user's editor settings, keybindings, or theme.

### Rule 2: Completions Must Feel Fast
- Completion response must be under 50ms. If it takes longer, users disable the extension.
- Sort completions by relevance to the current section — don't dump 200 items alphabetically.
- Use `CompletionItemKind` correctly: `Keyword` for directives, `Property` for options, `Value` for enumerated values, `Reference` for backend/frontend names.
- Mark deprecated completions with `tags: [CompletionItemTag.Deprecated]` — VSCode strikethroughs them automatically.

### Rule 3: Diagnostics Must Be Actionable
- Every diagnostic must explain *what is wrong* and *how to fix it* in the message string.
  - Bad: `"Unknown directive"`
  - Good: `"'reqrep' was removed in HAProxy 2.4. Use 'http-request replace-value' instead."`
- Provide `DiagnosticRelatedInformation` for cross-reference errors (e.g., backend referenced but not defined — link to the `use_backend` line).
- Use diagnostic severity consistently:
  - `Error`: config will not load (unknown directive, syntax error, missing required param).
  - `Warning`: config loads but behavior may be unexpected (deprecated directive, sub-optimal setting).
  - `Information`: suggestion for improvement.
  - `Hint`: style-only (e.g., inconsistent indentation).

### Rule 4: Hover Must Be Scannable in 3 Seconds
Hover content structure (in order):
```
**directive-name** `signature`
─────────────────────────────
One-line description of what this does.

**Valid in:** frontend, backend, listen
**Since:** HAProxy 2.2  |  **Deprecated in:** 3.0

[📖 HAProxy Docs](https://docs.haproxy.org/...)
```
- Use horizontal rules and bold headers to enable scanning.
- Never show more than 10 lines of hover content — link to docs for the full reference.
- Include a clickable docs link on every hover.

### Rule 5: Status Bar Integration
- Show the active HAProxy version in the status bar when a `.cfg` file is open: `HAProxy: 3.1`
- Clicking it opens a QuickPick to change the version for the current workspace.
- Status bar item priority: right side, low priority (don't crowd the left side).

### Rule 6: Output Channel
- Create a named output channel: `"HAProxy"`.
- Log language server startup, version detection, and errors to it — never to the console.
- Do not spam the output channel with per-keystroke events. Log only startup, config changes, and errors.

### Rule 7: Configuration UX
All settings exposed in `contributes.configuration`:
| Setting | Type | Default | Description |
|---|---|---|---|
| `haproxy.version` | enum | `"3.1"` | HAProxy version to validate against |
| `haproxy.validate.enable` | boolean | `true` | Enable/disable live validation |
| `haproxy.completion.enable` | boolean | `true` | Enable/disable autocompletion |
| `haproxy.trace.server` | enum | `"off"` | LSP trace level for debugging |

- Setting names follow VSCode convention: `extensionId.category.name`.
- Every setting must have a `description` and `markdownDescription` (the latter renders in Settings UI).
- Enum settings must list all valid values with `enumDescriptions`.

### Rule 8: Error Recovery UX
- If the language server fails to start: show one notification with a "Show Logs" action.
- If a config file is too large to parse (> 10,000 lines): show a `Information` notification once, disable diagnostics for that file, keep syntax highlighting active.
- If the user selects an unknown HAProxy version: fall back to nearest known version and show a status bar warning.
- Never silently fail — always give the user a signal that something went wrong.

## Accessibility
- All status bar items must have `tooltip` text.
- Completion item `detail` and `documentation` must be plain text or valid Markdown — no raw HTML.
- Color decorations (if used) must not be the only indicator of state — use icons or text alongside color.
- Test extension with VSCode high-contrast themes — highlight scopes must be visible.

## Marketplace Presence (README & Icon)
- Extension icon: 128×128px PNG, clear HAProxy visual identity (use HAProxy's official color palette: dark blue/orange), no text in icon.
- README must include: feature list with GIF demos, installation, configuration, version support table, contributing guide, license.
- GIF demos are mandatory for: syntax highlighting, autocompletion in action, a validation error with message.
- README badges: VSCode Marketplace version, installs, rating, CI status, license.
- Keywords in `package.json`: `haproxy`, `load-balancer`, `proxy`, `config`, `lsp`, `syntax`.
- Categories: `["Programming Languages", "Linters", "Snippets", "Formatters"]`.

---

# PART VI — VSCode EXTENSION SPECIFICS

## package.json (Extension Manifest)
- `"publisher"`: required for packaging. Set to publisher ID registered on marketplace.
- `"engines.vscode"`: `"^1.110.0"` (current minimum).
- `"activationEvents"`: `["onLanguage:haproxy"]` only.
- Register language: extensions `.cfg`, `.conf`; filename patterns `haproxy.cfg`, `haproxy.conf`.
- Commands registered in `contributes.commands` must also be registered in `activate()`.
- `"main"`: points to bundled client output, e.g. `"./client/out/extension.js"`.

## Language Server Lifecycle
- `onInitialize`: declare all server capabilities explicitly. Don't assume client supports anything.
- `onInitialized`: send `workspace/configuration` request to get initial settings.
- `onDidChangeConfiguration`: update server state and re-validate all open documents.
- `onDidOpenTextDocument` / `onDidChangeTextDocument`: parse + debounce validate.
- `onDidCloseTextDocument`: remove from AST cache, clear diagnostics.
- `onShutdown` + `onExit`: clean up gracefully.

## TextMate Grammar Scopes
| Token | Scope |
|---|---|
| Section header (`frontend`, `backend`) | `entity.name.section.haproxy` |
| Directive keyword | `keyword.other.directive.haproxy` |
| Option keyword (`option`, `timeout`) | `keyword.control.haproxy` |
| ACL name | `entity.name.label.haproxy` |
| Backend reference | `entity.name.function.haproxy` |
| Comment | `comment.line.number-sign.haproxy` |
| String value | `string.quoted.double.haproxy` |
| IP address | `constant.numeric.ip.haproxy` |
| Port number | `constant.numeric.port.haproxy` |
| Timeout value | `constant.numeric.timeout.haproxy` |

## Snippets
Must include (prefix → description):
- `frontend` → HTTP frontend boilerplate
- `frontend-ssl` → HTTPS frontend with SSL termination
- `backend` → HTTP backend with health check
- `backend-ssl` → HTTPS backend
- `listen` → combined frontend+backend
- `defaults` → sensible defaults block
- `global` → global config with logging
- `acl` → ACL definition
- `use_backend` → conditional backend routing
- `server` → server line with health check
- `httpchk` → HTTP health check option

All snippets use tabstops `${1:placeholder}` for every variable field.

---

# PART VII — CI/CD & PUBLISHING

## GitHub Actions Workflows

### CI (`ci.yml`) — triggers on every push and PR
```
1. Checkout
2. Setup Node.js 24.x
3. npm ci (root + client + server)
4. npm run lint
5. npm run compile (type-check)
6. npm test (unit + integration)
7. npm run build (esbuild bundle)
8. vsce package (dry-run, verify .vsix is producible)
```
- Runs on: `ubuntu-latest`, `windows-latest`, `macos-latest`.
- Block merge if any step fails.

### Publish (`publish.yml`) — triggers on tag push `v*.*.*`
```
1. Checkout
2. Setup Node.js 24.x
3. npm ci
4. npm run lint
5. npm run compile
6. npm test
7. npm run build
8. vsce publish --pat ${{ secrets.VSCE_PAT }}
9. Create GitHub Release with CHANGELOG excerpt
```
- `VSCE_PAT` stored in GitHub repository secrets only.
- Never publish from local machine.
- The publish job requires all CI steps to pass first (job dependency).

## Release Checklist (enforced by CI)
- [ ] All tests pass
- [ ] No HIGH/CRITICAL npm audit findings
- [ ] `CHANGELOG.md` updated with version and date
- [ ] `package.json` version bumped (semver)
- [ ] `vsce ls` reviewed — no sensitive files bundled
- [ ] README GIFs still accurate (manual check)

---

# PART VIII — HAPROXY DOMAIN RULES

## Config Format
- Case-sensitive directives.
- Section headers at column 0, directives indented (any whitespace, normalize to 4 spaces).
- Comments: `#` to end of line. Inline comments are valid.
- Continuation lines: trailing `\` joins with next line.
- Quoted strings support `\"` and `\\` escapes.

## Sections
| Section | Purpose |
|---|---|
| `global` | Process-level settings (daemon, log, nbthread, etc.) |
| `defaults` | Default settings inherited by frontends/backends |
| `frontend` | Accepts incoming connections, routes to backends |
| `backend` | Group of servers, load balancing, health checks |
| `listen` | Combined frontend + backend (legacy / simple use cases) |
| `userlist` | User authentication lists |
| `peers` | State synchronization between HAProxy instances |
| `resolvers` | DNS resolver configuration |
| `mailers` | Email alert configuration |
| `ring` | Ring buffer for log forwarding |
| `log-forward` | Log forwarding to remote syslog |
| `program` | External program management |
| `http-errors` | Custom HTTP error pages |
| `cache` | HTTP response cache configuration |

## Validation Rules (key)
- Unknown directive in any section → Error.
- Directive used in wrong section (e.g., `use_backend` in `backend`) → Error.
- Missing required argument → Error.
- Directive deprecated in selected version → Warning with migration hint.
- Directive not yet available in selected version → Error with "available since X" message.
- Invalid timeout format (not `<n>ms|s|m|h|d`) → Error.
- Port out of range (< 1 or > 65535) → Error.
- `use_backend` references a name not defined in any `backend` or `listen` block → Warning.
- `mode tcp` + HTTP-only directive in same section → Error.
- `mode http` + TCP-only directive in same section → Error.

## HAProxy Versions to Support
| Version | Type | Notes |
|---|---|---|
| 2.4 | LTS | End of life 2026, still widely deployed |
| 2.6 | LTS | Common in enterprise |
| 2.8 | LTS | Recommended current LTS |
| 3.0 | Stable | First 3.x release |
| 3.1 | Stable | Latest stable, **default** |

---

# PART IX — DEPENDENCY VERSIONS

| Package | Version |
|---|---|
| Node.js | 24.x LTS |
| TypeScript | 6.0 |
| @types/node | ^22.17.2 |
| vscode-languageclient | 9.0.1 |
| vscode-languageserver | 9.0.1 |
| vscode-languageserver-textdocument | 1.0.12 |
| vscode-languageserver-types | 3.17.5 |
| @vscode/test-electron | 2.5.2 |
| @vscode/vsce | 3.7.1 |
| eslint | 10.2.0 |
| @typescript-eslint/eslint-plugin | 8.58.0 |
| @typescript-eslint/parser | 8.58.0 |
| esbuild | 0.28.0 |
| VSCode engine minimum | ^1.110.0 |

Update versions only when explicitly asked. Document the reason for each version bump in the commit message.

---

# PART X — GIT & CONVENTIONS

## Git Identity
All commits authored as:
- **Name:** Juan Torchia
- **Email:** j.s.torchia@gmail.com
- No "Co-Authored-By: Claude" trailers.
- On repo init: `git config user.name "Juan Torchia" && git config user.email "j.s.torchia@gmail.com"`

## Commit Convention
Format: `type(scope): description`
- `feat(hover)`: add version badge to hover docs
- `fix(parser)`: handle continuation lines with CRLF endings
- `perf(server)`: cache AST invalidation on partial edits only
- `chore(deps)`: bump esbuild to 0.28.0
- `test(validator)`: add 2.4 deprecation rule coverage
- `docs(readme)`: add GIF demo for completion

## Language Convention
- Code, comments, variable names, commit messages: **English**
- Communication with the user: **Spanish**
