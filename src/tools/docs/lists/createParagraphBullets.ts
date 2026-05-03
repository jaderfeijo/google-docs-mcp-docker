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
		name: 'createParagraphBullets',
		description:
			'Applies bullets or numbering to every paragraph that overlaps the given range in a Google Doc. ' +
			'Use this to turn existing paragraphs into a list, or to change the style of an existing list ' +
			'(re-running with a different preset replaces the previous one). To remove bullets, use ' +
			'deleteParagraphBullets. To change the indent / nesting depth of list items, use ' +
			'applyParagraphStyle with indentStart / indentFirstLine.',
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
					'Exclusive end of the range. Must be greater than startIndex. Any paragraph that ' +
					'overlaps the range will be turned into a list item.'
				),
			bulletPreset: BulletPresetSchema.describe(
				'Bullet glyph preset. BULLET_* values produce bulleted lists; NUMBERED_* values produce ' +
				'numbered lists. The preset defines the glyphs at each nesting level.'
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
				`Applying ${args.bulletPreset} to range [${args.startIndex}, ${args.endIndex}) in doc ${args.documentId}`
			);
			try {
				const docs = await getDocsClient();

				const request: any = {
					createParagraphBullets: {
						range: {
							startIndex: args.startIndex,
							endIndex: args.endIndex,
							...(args.tabId ? { tabId: args.tabId } : {}),
						},
						bulletPreset: args.bulletPreset,
					},
				};

				await executeBatchUpdate(docs, args.documentId, [request]);

				return (
					`Applied bullet preset ${args.bulletPreset} to range ` +
					`[${args.startIndex}, ${args.endIndex}).`
				);
			} catch (error: any) {
				if (error instanceof UserError) throw error;
				log.error(`Error applying paragraph bullets: ${error.message || error}`);
				throw new UserError(
					`Failed to apply paragraph bullets: ${error.message || 'Unknown error'}. ` +
					`The range may cross a non-paragraph element (table, footnote, etc.) — verify with readGoogleDoc.`
				);
			}
		},
	});
}
