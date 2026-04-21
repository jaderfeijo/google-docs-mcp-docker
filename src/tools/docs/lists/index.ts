import type { FastMCP } from 'fastmcp';
import { register as applyMarkdownWithListSemantics } from './applyMarkdownWithListSemantics.js';

export function registerListTools(server: FastMCP) {
	applyMarkdownWithListSemantics(server);
}
