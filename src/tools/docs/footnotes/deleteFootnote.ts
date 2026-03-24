import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';
import { executeBatchUpdate } from '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteFootnote',
    description:
      'Deletes a footnote from a Google Doc by removing its reference marker from the document body. ' +
      'This automatically removes the footnote content as well. ' +
      'The Google Docs API does not have a direct "delete footnote" request — ' +
      'removing the reference is the correct approach.',
    parameters: DocumentIdParameter.extend({
      footnoteId: z
        .string()
        .describe('The footnote ID to delete (from createFootnote or listFootnotes).'),
    }),
    execute: async (args: any, { log }: any) => {
      log.info(`Deleting footnote ${args.footnoteId} from doc ${args.documentId}`);
      try {
        const docs = await getDocsClient();

        // Fetch the document to find the footnote reference element
        const doc = await docs.documents.get({
          documentId: args.documentId,
        });

        // Verify the footnote exists
        if (!doc.data.footnotes?.[args.footnoteId]) {
          throw new UserError(
            `Footnote with ID "${args.footnoteId}" not found in the document.`
          );
        }

        // Find the footnote reference in the body
        let refStartIndex: number | null = null;
        let refEndIndex: number | null = null;
        const bodyContent = doc.data.body?.content || [];

        for (const element of bodyContent) {
          if (element.paragraph) {
            for (const elem of element.paragraph.elements || []) {
              if (
                elem.footnoteReference?.footnoteId === args.footnoteId
              ) {
                refStartIndex = elem.startIndex ?? null;
                refEndIndex = elem.endIndex ?? null;
                break;
              }
            }
          }
          if (refStartIndex !== null) break;
        }

        if (refStartIndex === null || refEndIndex === null) {
          throw new UserError(
            `Could not find the footnote reference for "${args.footnoteId}" in the document body.`
          );
        }

        // Delete the footnote reference from the body — this removes the footnote entirely
        const request: any = {
          deleteContentRange: {
            range: {
              startIndex: refStartIndex,
              endIndex: refEndIndex,
              segmentId: '',
            },
          },
        };

        await executeBatchUpdate(docs, args.documentId, [request]);

        return `Footnote ${args.footnoteId} deleted successfully.`;
      } catch (error: any) {
        if (error instanceof UserError) throw error;
        log.error(`Error deleting footnote: ${error.message || error}`);
        throw new UserError(
          `Failed to delete footnote: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
