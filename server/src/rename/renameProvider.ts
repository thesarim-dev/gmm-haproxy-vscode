import { WorkspaceEdit, TextEdit, Range } from 'vscode-languageserver/node';
import { Position } from 'vscode-languageserver/node';
import { HaproxyDocument, SourceRange } from '../parser/ast';
import { resolveSymbolAtPosition, collectOccurrences, containsPosition } from '../shared/symbolResolver';

/**
 * Provides symbol rename across all named cross-references:
 * backend, defaults, ACL, server, cache, userlist, resolvers, and peers names.
 *
 * Rename is atomic — every occurrence in the document is updated in one edit.
 * For ACL references using the negated `!name` form, only the name portion
 * (without `!`) is replaced, which is correct because `symbolResolver` already
 * returns range-without-negation for those tokens.
 */
export class RenameProvider {
  /**
   * Called before the rename dialog opens. Validates that the cursor is on a
   * renameable symbol and returns the current name's range so VSCode can
   * pre-select it in the input box.
   */
  prepareRename(
    doc: HaproxyDocument,
    position: Position
  ): { range: Range; placeholder: string } | null {
    const symbol = resolveSymbolAtPosition(doc, position);
    if (!symbol) return null;

    for (const { range } of collectOccurrences(doc, symbol)) {
      if (containsPosition(range, position)) {
        return { range: toRange(range), placeholder: symbol.name };
      }
    }
    return null;
  }

  /** Return a WorkspaceEdit that replaces every occurrence of the symbol with newName. */
  provideRename(
    doc: HaproxyDocument,
    position: Position,
    newName: string
  ): WorkspaceEdit | null {
    const symbol = resolveSymbolAtPosition(doc, position);
    if (!symbol) return null;

    const edits: TextEdit[] = collectOccurrences(doc, symbol).map(({ range }) => ({
      range: toRange(range),
      newText: newName,
    }));

    return edits.length > 0 ? { changes: { [doc.uri]: edits } } : null;
  }
}

function toRange(r: SourceRange): Range {
  return {
    start: { line: r.startLine, character: r.startCharacter },
    end:   { line: r.endLine,   character: r.endCharacter   },
  };
}
