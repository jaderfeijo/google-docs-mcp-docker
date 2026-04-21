import { UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { DocumentIdParameter } from '@a-bonus/google-docs-mcp/dist/types.js';
import {
	executeBatchUpdate,
	executeBatchUpdateWithSplitting,
	findTabById,
} from '@a-bonus/google-docs-mcp/dist/googleDocsApiHelpers.js';
import { convertMarkdownToRequests } from '@a-bonus/google-docs-mcp/dist/markdown-transformer/markdownToDocs.js';

const TargetSchema = z.discriminatedUnion('mode', [
	z.object({
		mode: z.literal('append'),
	}),
	z.object({
		mode: z.literal('replaceDocument'),
		preserveFirstParagraph: z.boolean().optional().default(false),
	}),
	z
		.object({
			mode: z.literal('replaceRange'),
			startIndex: z.number().int().min(1),
			endIndex: z.number().int().min(1),
		})
		.refine((v) => v.endIndex > v.startIndex, {
			message: 'endIndex must be greater than startIndex',
			path: ['endIndex'],
		}),
]);

const Parameters = DocumentIdParameter.extend({
	markdown: z.string().min(1).describe('Markdown content to apply.'),
	target: TargetSchema.default({ mode: 'append' }).describe(
		'Where to apply markdown: append, replaceDocument, or replaceRange.'
	),
	tabId: z
		.string()
		.optional()
		.describe('Optional tab ID for multi-tab documents.'),
	firstHeadingAsTitle: z
		.boolean()
		.optional()
		.default(false)
		.describe('Treat the first H1 as Docs TITLE style.'),
	dryRun: z
		.boolean()
		.optional()
		.default(false)
		.describe('If true, returns a plan only and does not mutate document.'),
});

type IndexRange = { startIndex: number; endIndex: number; tabId?: string };

function chunkRequests(requests: any[], size = 50): any[][] {
	const chunks: any[][] = [];
	for (let i = 0; i < requests.length; i += size) {
		chunks.push(requests.slice(i, i + size));
	}
	return chunks;
}

async function executeRequestsInChunks(
	docs: any,
	documentId: string,
	requests: any[]
): Promise<number> {
	let calls = 0;
	for (const batch of chunkRequests(requests, 50)) {
		await executeBatchUpdate(docs, documentId, batch);
		calls++;
	}
	return calls;
}

function withTab(range: IndexRange, tabId?: string): IndexRange {
	if (!tabId) return range;
	return { ...range, tabId };
}

function classifyRequests(requests: any[]) {
	const deleteRequests: any[] = [];
	const insertRequests: any[] = [];
	const listRequests: any[] = [];
	const otherFormatRequests: any[] = [];

	for (const req of requests) {
		if (req.deleteContentRange) {
			deleteRequests.push(req);
			continue;
		}
		if (
			req.insertText ||
			req.insertTable ||
			req.insertPageBreak ||
			req.insertInlineImage ||
			req.insertSectionBreak
		) {
			insertRequests.push(req);
			continue;
		}
		if (req.createParagraphBullets || req.deleteParagraphBullets) {
			listRequests.push(req);
			continue;
		}
		otherFormatRequests.push(req);
	}

	return {
		deleteRequests,
		insertRequests,
		listRequests,
		otherFormatRequests,
	};
}

async function getBodyContent(docs: any, documentId: string, tabId?: string) {
	const response = await docs.documents.get({
		documentId,
		includeTabsContent: !!tabId,
		fields: tabId ? 'tabs' : 'body(content(startIndex,endIndex))',
	});
	if (!tabId) return response.data.body?.content ?? [];

	const tab = findTabById(response.data, tabId);
	if (!tab) throw new UserError(`Tab with ID "${tabId}" not found in document.`);
	if (!tab.documentTab) {
		throw new UserError(
			`Tab "${tabId}" does not have content (may not be a document tab).`
		);
	}
	return tab.documentTab.body?.content ?? [];
}

async function resolveTargetRange(
	docs: any,
	documentId: string,
	target: z.infer<typeof TargetSchema>,
	tabId?: string
): Promise<{ insertionIndex: number; deletionRange?: IndexRange }> {
	const bodyContent = await getBodyContent(docs, documentId, tabId);
	const lastEndIndex = bodyContent.length
		? (bodyContent[bodyContent.length - 1].endIndex ?? 2)
		: 2;
	const docEnd = Math.max(1, lastEndIndex - 1);

	if (target.mode === 'append') {
		return { insertionIndex: docEnd };
	}

	if (target.mode === 'replaceRange') {
		return {
			insertionIndex: target.startIndex,
			deletionRange: withTab(
				{ startIndex: target.startIndex, endIndex: target.endIndex },
				tabId
			),
		};
	}

	let startIndex = 1;
	if (target.preserveFirstParagraph) {
		for (const element of bodyContent) {
			if (element.paragraph && element.endIndex) {
				startIndex = element.endIndex;
				break;
			}
		}
	}

	return {
		insertionIndex: startIndex,
		deletionRange:
			docEnd > startIndex
				? withTab({ startIndex, endIndex: docEnd }, tabId)
				: undefined,
	};
}

async function cleanupSurvivorParagraph(
	docs: any,
	documentId: string,
	insertionIndex: number,
	tabId?: string
) {
	const bodyContent = await getBodyContent(docs, documentId, tabId);
	const survivorEnd = bodyContent.length
		? (bodyContent[bodyContent.length - 1].endIndex ?? insertionIndex + 1)
		: insertionIndex + 1;
	const range = withTab(
		{ startIndex: insertionIndex, endIndex: survivorEnd },
		tabId
	);
	const cleanupRequests = [
		{ deleteParagraphBullets: { range } },
		{
			updateTextStyle: {
				range,
				textStyle: {
					underline: false,
					bold: false,
					italic: false,
					strikethrough: false,
					foregroundColor: {},
					backgroundColor: {},
				},
				fields:
					'underline,bold,italic,strikethrough,foregroundColor,backgroundColor',
			},
		},
	];
	await executeBatchUpdate(docs, documentId, cleanupRequests);
}

export function register(server: FastMCP) {
	server.addTool({
		name: 'applyMarkdownWithListSemantics',
		description:
			'Applies markdown with list-aware orchestration in distinct phases (normalize/content/list/style). Stateless per invocation.',
		parameters: Parameters,
		execute: async (args: z.infer<typeof Parameters>, { log }: any) => {
			const docs = await getDocsClient();
			const plan = await resolveTargetRange(
				docs,
				args.documentId,
				args.target,
				args.tabId
			);

			const requests = convertMarkdownToRequests(
				args.markdown,
				plan.insertionIndex,
				args.tabId,
				args.firstHeadingAsTitle ? { firstHeadingAsTitle: true } : undefined
			);
			const groups = classifyRequests(requests);

			if (args.dryRun) {
				return JSON.stringify(
					{
						mode: args.target.mode,
						insertionIndex: plan.insertionIndex,
						deletionRange: plan.deletionRange ?? null,
						requestCounts: {
							total: requests.length,
							delete: groups.deleteRequests.length,
							insert: groups.insertRequests.length,
							list: groups.listRequests.length,
							otherFormat: groups.otherFormatRequests.length,
						},
					},
					null,
					2
				);
			}

			let totalCalls = 0;

			// Phase 1: normalize (when replacing content)
			if (plan.deletionRange) {
				await executeBatchUpdate(docs, args.documentId, [
					{ deleteContentRange: { range: plan.deletionRange } },
				]);
				totalCalls++;
				await cleanupSurvivorParagraph(
					docs,
					args.documentId,
					plan.insertionIndex,
					args.tabId
				);
				totalCalls++;
			}

			// Phase 2: content inserts
			totalCalls += await executeRequestsInChunks(
				docs,
				args.documentId,
				groups.insertRequests
			);

			// Phase 3: list operations only
			if (groups.listRequests.length > 0) {
				totalCalls += await executeRequestsInChunks(
					docs,
					args.documentId,
					groups.listRequests
				);
			}

			// Phase 4: non-list formatting
			if (groups.otherFormatRequests.length > 0) {
				const formatMeta = await executeBatchUpdateWithSplitting(
					docs,
					args.documentId,
					groups.otherFormatRequests,
					log
				);
				totalCalls += formatMeta.totalApiCalls ?? 0;
			}

			return `Applied markdown with list-aware phases. mode=${args.target.mode}, requests=${requests.length}, apiCalls=${totalCalls}.`;
		},
	});
}
