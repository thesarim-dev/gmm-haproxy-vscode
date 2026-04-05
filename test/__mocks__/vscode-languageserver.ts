/** Minimal mock of vscode-languageserver/node for unit tests. */

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export enum CompletionItemKind {
  Keyword = 14,
  Property = 10,
  Value = 12,
  Reference = 18,
  Function = 3,
  Constant = 21,
}

export enum CompletionItemTag {
  Deprecated = 1,
}

export enum MarkupKind {
  Markdown = 'markdown',
  PlainText = 'plaintext',
}

export interface Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface Diagnostic {
  severity?: DiagnosticSeverity;
  range: Range;
  message: string;
  source?: string;
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: unknown;
  tags?: CompletionItemTag[];
}

export interface Hover {
  contents: unknown;
  range?: Range;
}

export interface Position {
  line: number;
  character: number;
}

// Stub unused exports to satisfy imports
export const createConnection = (): unknown => ({});
export const TextDocuments = class {};
export const ProposedFeatures = { all: {} };
export const TextDocumentSyncKind = { Incremental: 2 };
export const DidChangeConfigurationNotification = { type: {} };
