import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';
import { executeBatchUpdate } from '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertTableRow',
    description:
      'Inserts a new row into an existing table in a Google Doc. ' +
      'Specify the table by its 0-based index within the document and the row index to insert relative to. ' +
      'The new row inherits the column count and basic structure of the existing rows.',
    parameters: DocumentIdParameter.extend({
      tableIndex: z
        .number()
        .int()
        .min(0)
        .describe(
          'Which table in the document (0-based). The first table is 0, second is 1, etc.'
        ),
      rowIndex: z
        .number()
        .int()
        .min(0)
        .describe(
          'The 0-based row index to insert relative to. For example, 0 refers to the first row.'
        ),
      insertBelow: z
        .boolean()
        .default(true)
        .describe(
          'If true (default), the new row is inserted below the specified row. ' +
          'If false, the new row is inserted above it.'
        ),
      tabId: z
        .string()
        .optional()
        .describe('Optional tab ID if the document has multiple tabs.'),
    }),
    execute: async (args: any, { log }: any) => {
      log.info(
        `Inserting table row in doc ${args.documentId}, table ${args.tableIndex}, ` +
        `${args.insertBelow ? 'below' : 'above'} row ${args.rowIndex}`
      );
      try {
        const docs = await getDocsClient();

        // Fetch the document to find the table's start index
        const docResponse = await docs.documents.get({
          documentId: args.documentId,
          ...(args.tabId ? { includeTabsContent: true } : {}),
        });

        // Resolve the correct body content (tab-aware)
        let body: any;
        if (args.tabId) {
          const tabs: any[] = (docResponse as any).data?.tabs || [];
          const tab = findTab(tabs, args.tabId);
          if (!tab) {
            throw new UserError(`Tab with ID "${args.tabId}" not found.`);
          }
          body = tab.documentTab?.body;
        } else {
          body = (docResponse as any).data?.body;
        }

        if (!body?.content) {
          throw new UserError('Document body is empty or inaccessible.');
        }

        // Walk the body elements to find the Nth table
        let tableCount = 0;
        let tableStartIndex: number | undefined;
        for (const element of body.content) {
          if (element.table) {
            if (tableCount === args.tableIndex) {
              tableStartIndex = element.startIndex;
              break;
            }
            tableCount++;
          }
        }

        if (tableStartIndex === undefined) {
          throw new UserError(
            `Table at index ${args.tableIndex} not found. ` +
            `The document has ${tableCount} table(s) (0-indexed).`
          );
        }

        const request: any = {
          insertTableRow: {
            tableCellLocation: {
              tableStartLocation: {
                index: tableStartIndex,
                ...(args.tabId ? { tabId: args.tabId } : {}),
              },
              rowIndex: args.rowIndex,
              columnIndex: 0,
            },
            insertBelow: args.insertBelow,
          },
        };

        await executeBatchUpdate(docs, args.documentId, [request]);

        return (
          `Row inserted successfully ${args.insertBelow ? 'below' : 'above'} ` +
          `row ${args.rowIndex} in table ${args.tableIndex}.`
        );
      } catch (error: any) {
        if (error instanceof UserError) throw error;
        log.error(`Error inserting table row: ${error.message || error}`);
        throw new UserError(
          `Failed to insert table row: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}

/** Recursively search tabs (including child tabs) for a matching tabId. */
function findTab(tabs: any[], tabId: string): any {
  for (const tab of tabs) {
    if (tab.tabProperties?.tabId === tabId) return tab;
    if (tab.childTabs?.length) {
      const found = findTab(tab.childTabs, tabId);
      if (found) return found;
    }
  }
  return null;
}
