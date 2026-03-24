import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getFootnote',
    description:
      'Gets the full content of a specific footnote by its ID, including text content ' +
      'and element index positions (useful for inserting or formatting text within the footnote).',
    parameters: DocumentIdParameter.extend({
      footnoteId: z
        .string()
        .describe('The footnote ID (returned by createFootnote or listFootnotes).'),
    }),
    execute: async (args: any, { log }: any) => {
      log.info(`Getting footnote ${args.footnoteId} from doc ${args.documentId}`);
      try {
        const docs = await getDocsClient();
        const doc = await docs.documents.get({
          documentId: args.documentId,
        });

        const footnote = doc.data.footnotes?.[args.footnoteId];
        if (!footnote) {
          throw new UserError(
            `Footnote with ID "${args.footnoteId}" not found in the document.`
          );
        }

        // Extract detailed content with index positions
        let textContent = '';
        const elements: Array<{
          startIndex: number;
          endIndex: number;
          text: string;
        }> = [];

        for (const contentElement of footnote.content || []) {
          if (contentElement.paragraph) {
            for (const elem of contentElement.paragraph.elements || []) {
              if (elem.textRun?.content) {
                textContent += elem.textRun.content;
                elements.push({
                  startIndex: elem.startIndex || 0,
                  endIndex: elem.endIndex || 0,
                  text: elem.textRun.content,
                });
              }
            }
          }
        }

        // Find the reference in the body for display number
        let footnoteNumber = '';
        const bodyContent = doc.data.body?.content || [];
        for (const element of bodyContent) {
          if (element.paragraph) {
            for (const elem of element.paragraph.elements || []) {
              if (
                elem.footnoteReference?.footnoteId === args.footnoteId
              ) {
                footnoteNumber = elem.footnoteReference.footnoteNumber || '';
                break;
              }
            }
          }
          if (footnoteNumber) break;
        }

        const result = {
          footnoteId: args.footnoteId,
          footnoteNumber,
          textContent: textContent.trim(),
          elements,
        };

        return JSON.stringify(result, null, 2);
      } catch (error: any) {
        if (error instanceof UserError) throw error;
        log.error(`Error getting footnote: ${error.message || error}`);
        throw new UserError(
          `Failed to get footnote: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
