import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';
import { executeBatchUpdate } from '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createFootnote',
    description:
      'Creates a footnote at the specified character index in a Google Doc. ' +
      'Returns the footnote ID which can be used with insertFootnoteText to add content. ' +
      'The footnote reference marker (superscript number) is inserted at the given index.',
    parameters: DocumentIdParameter.extend({
      index: z
        .number()
        .int()
        .min(1)
        .describe(
          'The character index where the footnote reference should be inserted (1-based). ' +
          'Use readGoogleDoc to find the correct index position.'
        ),
      tabId: z
        .string()
        .optional()
        .describe('Optional tab ID if the document has multiple tabs.'),
    }),
    execute: async (args: any, { log }: any) => {
      log.info(`Creating footnote at index ${args.index} in doc ${args.documentId}`);
      try {
        const docs = await getDocsClient();

        const request: any = {
          createFootnote: {
            location: {
              index: args.index,
              ...(args.tabId ? { tabId: args.tabId } : {}),
            },
          },
        };

        const result = await executeBatchUpdate(docs, args.documentId, [request]);
        const footnoteId = (result as any).replies?.[0]?.createFootnote?.footnoteId;

        if (!footnoteId) {
          throw new UserError(
            'Footnote was created but no footnote ID was returned. This is unexpected.'
          );
        }

        return (
          `Footnote created successfully.\n` +
          `Footnote ID: ${footnoteId}\n` +
          `Use insertFootnoteText with this ID to add content to the footnote.`
        );
      } catch (error: any) {
        if (error instanceof UserError) throw error;
        log.error(`Error creating footnote: ${error.message || error}`);
        throw new UserError(`Failed to create footnote: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
