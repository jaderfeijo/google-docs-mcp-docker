// Type declarations for @a-bonus/google-docs-mcp deep imports.
// The upstream package ships only JS (no .d.ts files).

declare module '@a-bonus/google-docs-mcp/dist/cachedToolsList.js' {
  export function collectToolsWhileRegistering(server: any, out: any[]): void;
  export function buildCachedToolsListPayload(tools: any[]): Promise<any>;
  export function installCachedToolsListHandler(server: any, listPayload: any): void;
}

declare module '@a-bonus/google-docs-mcp/dist/clients.js' {
  export function initializeGoogleClient(): Promise<any>;
  export function getDocsClient(): Promise<any>;
  export function getDriveClient(): Promise<any>;
  export function getSheetsClient(): Promise<any>;
  export function getAuthClient(): Promise<any>;
  export function getScriptClient(): Promise<any>;
}

declare module '@a-bonus/google-docs-mcp/dist/tools/index.js' {
  export function registerAllTools(server: any): void;
}

declare module '@a-bonus/google-docs-mcp/dist/logger.js' {
  export const logger: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    debug: (...args: any[]) => void;
  };
}

declare module '@a-bonus/google-docs-mcp/dist/auth.js' {
  export function runAuthFlow(): Promise<void>;
  export function authorize(): Promise<any>;
}

declare module '@a-bonus/google-docs-mcp/dist/types.js' {
  import { z } from 'zod';
  export const DocumentIdParameter: z.ZodObject<any>;
  export const RangeParameters: any;
  export const OptionalRangeParameters: any;
  export const TextFindParameter: any;
  export const TextStyleParameters: any;
  export function hexToRgbColor(hex: string): { red: number; green: number; blue: number } | null;
  export const hexColorRegex: RegExp;
  export const validateHexColor: (color: string) => boolean;
}

declare module '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js' {
  export function executeBatchUpdate(docs: any, documentId: string, requests: any[]): Promise<any>;
  export function executeBatchUpdateWithSplitting(
    docs: any,
    documentId: string,
    requests: any[],
    log?: any
  ): Promise<any>;
  export function findTextRange(
    docs: any,
    documentId: string,
    textToFind: string,
    instance?: number,
    tabId?: string
  ): Promise<any>;
}

declare module '@a-bonus/google-docs-mcp/dist/markdown-transformer/markdownToDocs.js' {
	export function convertMarkdownToRequests(
		markdown: string,
		startIndex?: number,
		tabId?: string,
		options?: { firstHeadingAsTitle?: boolean }
	): any[];
}
