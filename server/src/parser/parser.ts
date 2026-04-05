import {
  HaproxyDocument,
  HaproxySection,
  HaproxyDirective,
  SectionType,
  SourceRange,
  Token,
  DirectiveArg,
  ParseError,
} from './ast';

const SECTION_KEYWORDS = new Set<string>([
  'global', 'defaults', 'frontend', 'backend', 'listen',
  'userlist', 'peers', 'resolvers', 'mailers', 'ring',
  'log-forward', 'program', 'http-errors', 'cache',
]);

/**
 * Fault-tolerant HAProxy config parser.
 * Produces a typed AST even for partial or broken configs.
 */
export class HaproxyParser {
  parse(text: string, uri: string): HaproxyDocument {
    const lines = text.split(/\r?\n/);
    const sections: HaproxySection[] = [];
    const parseErrors: ParseError[] = [];

    let currentSection: SectionBuilder | null = null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const rawLine = lines[lineIndex] ?? '';
      const line = stripComment(rawLine);
      const trimmed = line.trim();

      if (trimmed === '') continue;

      // Handle line continuation (backslash at end)
      let fullLine = trimmed;
      while (fullLine.endsWith('\\') && lineIndex + 1 < lines.length) {
        lineIndex++;
        const nextRaw = lines[lineIndex] ?? '';
        fullLine = fullLine.slice(0, -1).trim() + ' ' + stripComment(nextRaw).trim();
      }

      const tokens = tokenizeLine(fullLine, lineIndex);
      if (tokens.length === 0) continue;

      const firstToken = tokens[0];
      if (!firstToken) continue;
      const keyword = firstToken.value.toLowerCase();

      if (SECTION_KEYWORDS.has(keyword)) {
        if (currentSection) {
          sections.push(currentSection.build());
        }
        const nameToken = tokens[1];
        const name = nameToken?.value ?? '';
        currentSection = new SectionBuilder(
          keyword as SectionType,
          name,
          makeRange(lineIndex, 0, lineIndex, rawLine.length)
        );
      } else if (currentSection) {
        const directive = buildDirective(tokens, rawLine, lineIndex);
        currentSection.addDirective(directive);
      } else {
        parseErrors.push({
          message: `Directive '${firstToken.value}' appears outside of any section.`,
          range: makeRange(lineIndex, 0, lineIndex, rawLine.length),
        });
      }
    }

    if (currentSection) {
      sections.push(currentSection.build());
    }

    // Resolve mode inheritance from defaults
    resolveMode(sections);

    return { uri, sections, parseErrors };
  }
}

class SectionBuilder {
  private readonly directives: HaproxyDirective[] = [];

  constructor(
    private readonly type: SectionType,
    private readonly name: string,
    private readonly headerRange: SourceRange
  ) {}

  addDirective(directive: HaproxyDirective): void {
    this.directives.push(directive);
  }

  build(): HaproxySection {
    const modeDirective = this.directives.find((d) => d.keyword.value === 'mode');
    const modeValue = modeDirective?.args[0]?.value;
    const mode: 'http' | 'tcp' | undefined =
      modeValue === 'http' || modeValue === 'tcp' ? modeValue : undefined;

    return {
      type: this.type,
      name: this.name,
      headerRange: this.headerRange,
      directives: this.directives,
      mode,
    };
  }
}

function resolveMode(sections: HaproxySection[]): void {
  const defaultsSection = sections.find((s) => s.type === 'defaults');
  const defaultMode = defaultsSection?.mode;

  for (const section of sections) {
    if (section.type !== 'frontend' && section.type !== 'backend' && section.type !== 'listen') {
      continue;
    }
    if (!section.mode && defaultMode) {
      // Cast required because mode is readonly — we mutate during build resolution only
      (section as { mode?: 'http' | 'tcp' }).mode = defaultMode;
    }
  }
}

function buildDirective(
  tokens: Token[],
  rawLine: string,
  lineIndex: number
): HaproxyDirective {
  const [keywordToken, ...argTokens] = tokens;
  const keyword = keywordToken ?? { value: '', range: makeRange(lineIndex, 0, lineIndex, 0) };

  const args: DirectiveArg[] = argTokens.map((t) => ({
    value: t.value,
    range: t.range,
  }));

  const endChar = rawLine.trimEnd().length;
  return {
    keyword,
    args,
    range: makeRange(lineIndex, 0, lineIndex, endChar),
    raw: rawLine,
  };
}

function stripComment(line: string): string {
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (!ch) continue;
    if (inQuote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quoteChar) inQuote = false;
    } else {
      if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; }
      else if (ch === '#') return line.slice(0, i);
    }
  }
  return line;
}

function tokenizeLine(line: string, lineIndex: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Skip whitespace
    while (i < line.length && /\s/.test(line[i] ?? '')) i++;
    if (i >= line.length) break;

    const start = i;
    let value = '';

    if (line[i] === '"' || line[i] === "'") {
      const quoteChar = line[i];
      i++;
      while (i < line.length && line[i] !== quoteChar) {
        if (line[i] === '\\') i++;
        value += line[i] ?? '';
        i++;
      }
      i++; // closing quote
    } else {
      while (i < line.length && !/\s/.test(line[i] ?? '')) {
        value += line[i] ?? '';
        i++;
      }
    }

    if (value !== '') {
      tokens.push({
        value,
        range: makeRange(lineIndex, start, lineIndex, i),
      });
    }
  }

  return tokens;
}

function makeRange(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number
): SourceRange {
  return { startLine, startCharacter, endLine, endCharacter };
}
