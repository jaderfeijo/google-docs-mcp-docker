import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';
import { executeBatchUpdate } from '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js';

export function register(server: FastMCP) {
	server.addTool({
		name: 'deleteParagraphBullets',
		description:
			'Removes bullets or numbering from every paragraph that overlaps the given range in a Google Doc. ' +
			'The paragraphs themselves stay in place; only the list formatting (glyph + nesting indent) is ' +
			'cleared. To re-apply or change a list style, use createParagraphBullets.',
		parameters: DocumentIdParameter.extend({
			startIndex: z
				.number()
				.int()
				.min(1)
				.describe(
					'Inclusive start of the range, 1-based. Use readGoogleDoc to find the correct index.'
				),
			endIndex: z
				.number()
				.int()
				.min(1)
				.describe(
					'Exclusive end of the range. Must be greater than startIndex.'
				),
			tabId: z
				.string()
				.optional()
				.describe('Optional tab ID if the document has multiple tabs.'),
		}),
		execute: async (args: any, { log }: any) => {
			if (args.endIndex <= args.startIndex) {
				throw new UserError(
					`endIndex (${args.endIndex}) must be greater than startIndex (${args.startIndex}).`
				);
			}

			log.info(
				`Removing bullets from range [${args.startIndex}, ${args.endIndex}) in doc ${args.documentId}`
			);
			try {
				const docs = await getDocsClient();

				const request: any = {
					deleteParagraphBullets: {
						range: {
							startIndex: args.startIndex,
							endIndex: args.endIndex,
							...(args.tabId ? { tabId: args.tabId } : {}),
						},
					},
				};

				await executeBatchUpdate(docs, args.documentId, [request]);

				return `Removed bullets from range [${args.startIndex}, ${args.endIndex}).`;
			} catch (error: any) {
				if (error instanceof UserError) throw error;
				log.error(`Error removing paragraph bullets: ${error.message || error}`);
				throw new UserError(
					`Failed to remove paragraph bullets: ${error.message || 'Unknown error'}. ` +
					`The range may cross a non-paragraph element (table, footnote, etc.) — verify with readGoogleDoc.`
				);
			}
		},
	});
}
