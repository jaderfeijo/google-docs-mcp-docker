import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';
import { executeBatchUpdate } from '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js';

const BulletPresetSchema = z.enum([
	'BULLET_DISC_CIRCLE_SQUARE',
	'BULLET_DIAMONDX_ARROW3D_SQUARE',
	'BULLET_CHECKBOX',
	'BULLET_ARROW_DIAMOND_DISC',
	'BULLET_STAR_CIRCLE_SQUARE',
	'BULLET_ARROW3D_CIRCLE_SQUARE',
	'BULLET_LEFTTRIANGLE_DIAMOND_DISC',
	'BULLET_DIAMONDX_HOLLOWDIAMOND_SQUARE',
	'BULLET_DIAMOND_CIRCLE_SQUARE',
	'NUMBERED_DECIMAL_ALPHA_ROMAN',
	'NUMBERED_DECIMAL_ALPHA_ROMAN_PARENS',
	'NUMBERED_DECIMAL_NESTED',
	'NUMBERED_UPPERALPHA_ALPHA_ROMAN',
	'NUMBERED_UPPERROMAN_UPPERALPHA_DECIMAL',
	'NUMBERED_ZERODECIMAL_ALPHA_ROMAN',
]);

export function register(server: FastMCP) {
	server.addTool({
		name: 'insertList',
		description:
			'Inserts a new bulleted or numbered list at the given character index in a Google Doc, ' +
			'in a single atomic batchUpdate (text insert + bullet application succeed or fail together). ' +
			'Each item becomes its own paragraph and list entry. To turn existing text into a list, use ' +
			'createParagraphBullets instead.',
		parameters: DocumentIdParameter.extend({
			index: z
				.number()
				.int()
				.min(1)
				.describe(
					'Character index where the list should be inserted (1-based). The list is inserted ' +
					'before this index. Use readGoogleDoc to find the correct insertion point.'
				),
			items: z
				.array(z.string().min(1))
				.min(1)
				.describe(
					'List items, in order. Each becomes its own paragraph. Items must not be empty; ' +
					'do not include trailing newlines — they are added automatically.'
				),
			bulletPreset: BulletPresetSchema.describe(
				'Bullet glyph preset. BULLET_* values produce bulleted lists; NUMBERED_* values produce ' +
				'numbered lists.'
			),
			tabId: z
				.string()
				.optional()
				.describe('Optional tab ID if the document has multiple tabs.'),
		}),
		execute: async (args: any, { log }: any) => {
			if (args.items.some((item: string) => item.includes('\n'))) {
				throw new UserError(
					'List items must not contain newline characters. Pass each line as its own item.'
				);
			}

			log.info(
				`Inserting list of ${args.items.length} item(s) with preset ${args.bulletPreset} at index ${args.index} in doc ${args.documentId}`
			);
			try {
				const docs = await getDocsClient();

				// Each item becomes a paragraph: append \n after every item (including the last)
				// so the bullet preset attaches to every paragraph in the inserted range.
				const text = args.items.map((item: string) => item + '\n').join('');
				const startIndex = args.index;
				const endIndex = startIndex + text.length;

				const location: any = {
					index: startIndex,
					...(args.tabId ? { tabId: args.tabId } : {}),
				};
				const range: any = {
					startIndex,
					endIndex,
					...(args.tabId ? { tabId: args.tabId } : {}),
				};

				const requests: any[] = [
					{
						insertText: {
							location,
							text,
						},
					},
					{
						createParagraphBullets: {
							range,
							bulletPreset: args.bulletPreset,
						},
					},
				];

				await executeBatchUpdate(docs, args.documentId, requests);

				return (
					`Inserted ${args.items.length}-item list at index ${startIndex} ` +
					`with preset ${args.bulletPreset}. List spans [${startIndex}, ${endIndex}).`
				);
			} catch (error: any) {
				if (error instanceof UserError) throw error;
				log.error(`Error inserting list: ${error.message || error}`);
				throw new UserError(
					`Failed to insert list: ${error.message || 'Unknown error'}. ` +
					`The insertion index may not be valid for text insertion (e.g., inside a table cell ` +
					`or at a non-paragraph boundary) — verify with readGoogleDoc.`
				);
			}
		},
	});
}
