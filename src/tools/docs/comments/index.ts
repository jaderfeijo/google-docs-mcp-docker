import type { FastMCP } from 'fastmcp';
import { register as addComment } from './addComment.js';

export function registerCommentTools(server: FastMCP) {
  addComment(server);
}
