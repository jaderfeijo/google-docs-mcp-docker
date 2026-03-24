import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';
import { executeBatchUpdate } from '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertFootnoteText',
    description:
      'Inserts text into a footnote body. The footnote must already exist — use createFootnote first. ' +
      'If no index is specified, text is appended at the end of the existing footnote content.',
    parameters: DocumentIdParameter.extend({
      footnoteId: z
        .string()
        .describe('The footnote ID (returned by createFootnote or listFootnotes).'),
      text: z.string().min(1).describe('The text to insert into the footnote.'),
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Optional: the index within the footnote body to insert at (0-based). ' +
          'If omitted, text is appended at the end. Use getFootnote to find index positions.'
        ),
    }),
    execute: async (args: any, { log }: any) => {
      log.info(
        `Inserting text into footnote ${args.footnoteId} in doc ${args.documentId}`
      );
      try {
        const docs = await getDocsClient();

        let insertIndex = args.index;

        // If no index specified, find the end of the footnote content
        if (insertIndex === undefined) {
          const doc = await docs.documents.get({
            documentId: args.documentId,
          });
          const footnote = doc.data.footnotes?.[args.footnoteId];
          if (!footnote) {
            throw new UserError(
              `Footnote with ID "${args.footnoteId}" not found in the document.`
            );
          }

          // Find the last content element's endIndex (minus 1 to insert before the trailing newline)
          const content = footnote.content || [];
          let maxEndIndex = 0;
          for (const element of content) {
            if (element.paragraph) {
              for (const elem of element.paragraph.elements || []) {
                if (elem.endIndex && elem.endIndex > maxEndIndex) {
                  maxEndIndex = elem.endIndex;
                }
              }
            }
          }
          // Insert before the final newline character
          insertIndex = maxEndIndex > 0 ? maxEndIndex - 1 : 0;
        }

        const request: any = {
          insertText: {
            location: {
              index: insertIndex,
              segmentId: args.footnoteId,
            },
            text: args.text,
          },
        };

        await executeBatchUpdate(docs, args.documentId, [request]);

        return `Text inserted into footnote ${args.footnoteId} at index ${insertIndex}.`;
      } catch (error: any) {
        if (error instanceof UserError) throw error;
        log.error(`Error inserting footnote text: ${error.message || error}`);
        throw new UserError(
          `Failed to insert footnote text: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
