import type { FastMCP } from 'fastmcp';
import { register as createFootnote } from './createFootnote.js';
import { register as listFootnotes } from './listFootnotes.js';
import { register as getFootnote } from './getFootnote.js';
import { register as deleteFootnote } from './deleteFootnote.js';
import { register as insertFootnoteText } from './insertFootnoteText.js';

export function registerFootnoteTools(server: FastMCP) {
  createFootnote(server);
  listFootnotes(server);
  getFootnote(server);
  deleteFootnote(server);
  insertFootnoteText(server);
}
