import type { FastMCP } from 'fastmcp';
import { register as insertTableRow } from './insertTableRow.js';

export function registerTableTools(server: FastMCP) {
  insertTableRow(server);
}
