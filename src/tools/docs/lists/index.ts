import type { FastMCP } from 'fastmcp';
import { register as applyMarkdownWithListSemantics } from './applyMarkdownWithListSemantics.js';
import { register as createParagraphBullets } from './createParagraphBullets.js';
import { register as deleteParagraphBullets } from './deleteParagraphBullets.js';
import { register as insertList } from './insertList.js';

export function registerListTools(server: FastMCP) {
	applyMarkdownWithListSemantics(server);
	createParagraphBullets(server);
	deleteParagraphBullets(server);
	insertList(server);
}
