import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';

function extractTextFromContent(content: any[]): string {
  let text = '';
  for (const element of content) {
    if (element.paragraph) {
      for (const elem of element.paragraph.elements || []) {
        if (elem.textRun?.content) {
          text += elem.textRun.content;
        }
      }
    }
  }
  return text.trim();
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'listFootnotes',
    description:
      'Lists all footnotes in a Google Doc, including their IDs, display numbers, ' +
      'text content, and the character index where each footnote reference appears in the document body.',
    parameters: DocumentIdParameter,
    execute: async (args: any, { log }: any) => {
      log.info(`Listing footnotes in doc ${args.documentId}`);
      try {
        const docs = await getDocsClient();
        const doc = await docs.documents.get({
          documentId: args.documentId,
        });

        const footnotes = doc.data.footnotes || {};
        const footnoteIds = Object.keys(footnotes);

        if (footnoteIds.length === 0) {
          return 'No footnotes found in this document.';
        }

        // Scan body for footnote references to get positions and display numbers
        const referenceMap: Record<string, { index: number; footnoteNumber: string }> = {};
        const bodyContent = doc.data.body?.content || [];

        for (const element of bodyContent) {
          if (element.paragraph) {
            for (const elem of element.paragraph.elements || []) {
              if (elem.footnoteReference) {
                const refId = elem.footnoteReference.footnoteId;
                if (refId) {
                  referenceMap[refId] = {
                    index: elem.startIndex || 0,
                    footnoteNumber: elem.footnoteReference.footnoteNumber || '',
                  };
                }
              }
            }
          }
        }

        const result = footnoteIds.map((id) => {
          const footnote = footnotes[id];
          const textContent = extractTextFromContent(footnote.content || []);
          const ref = referenceMap[id];

          return {
            footnoteId: id,
            footnoteNumber: ref?.footnoteNumber || 'unknown',
            referenceIndex: ref?.index ?? null,
            textContent,
          };
        });

        // Sort by footnote number
        result.sort((a, b) => {
          const numA = parseInt(a.footnoteNumber, 10) || 0;
          const numB = parseInt(b.footnoteNumber, 10) || 0;
          return numA - numB;
        });

        return JSON.stringify(result, null, 2);
      } catch (error: any) {
        if (error instanceof UserError) throw error;
        log.error(`Error listing footnotes: ${error.message || error}`);
        throw new UserError(
          `Failed to list footnotes: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
