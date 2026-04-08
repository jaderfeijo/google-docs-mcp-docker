#!/usr/bin/env node
// src/index.ts
//
// Wrapper entry point that extends the upstream @a-bonus/google-docs-mcp
// server with additional footnote tools.

import { FastMCP } from 'fastmcp';
import {
  buildCachedToolsListPayload,
  collectToolsWhileRegistering,
  installCachedToolsListHandler,
} from '@a-bonus/google-docs-mcp/dist/cachedToolsList.js';
import { initializeGoogleClient } from '@a-bonus/google-docs-mcp/dist/clients.js';
import { registerAllTools } from '@a-bonus/google-docs-mcp/dist/tools/index.js';
import { logger } from '@a-bonus/google-docs-mcp/dist/logger.js';
import { registerFootnoteTools } from './tools/docs/footnotes/index.js';
import { registerTableTools } from './tools/docs/tables/index.js';
import { registerCommentTools } from './tools/docs/comments/index.js';

// --- Auth subcommand ---
if (process.argv[2] === 'auth') {
  const { runAuthFlow } = await import('@a-bonus/google-docs-mcp/dist/auth.js');
  try {
    await runAuthFlow();
    logger.info('Authorization complete. You can now start the MCP server.');
    process.exit(0);
  } catch (error: any) {
    logger.error('Authorization failed:', error.message || error);
    process.exit(1);
  }
}

// --- Server startup ---
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason, _promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

const server = new FastMCP({
  name: 'Ultimate Google Docs & Sheets MCP Server',
  version: '1.0.0',
});

// Wrap addTool to inject action/error logging for every tool
const originalAddTool = server.addTool.bind(server);
server.addTool = (toolDef: any) => {
  const originalExecute = toolDef.execute;
  toolDef.execute = async (args: any, context: any) => {
    const toolName = toolDef.name;
    logger.info(`[${toolName}] called with args: ${JSON.stringify(args)}`);
    try {
      const result = await originalExecute(args, context);
      const json = JSON.stringify(result) ?? 'undefined';
      logger.info(`[${toolName}] completed: ${json.slice(0, 200)}`);
      return result;
    } catch (error: any) {
      logger.info(`[${toolName}] ERROR: ${error.message || error}`);
      throw error;
    }
  };
  return originalAddTool(toolDef);
};

const registeredTools: any[] = [];
collectToolsWhileRegistering(server, registeredTools);

// Register all upstream tools (44 tools)
registerAllTools(server);

// Register our custom tools
registerFootnoteTools(server);
registerTableTools(server);

// Register custom comment tools (overrides upstream addComment with corrected anchor format)
registerCommentTools(server);

try {
  await initializeGoogleClient();
  logger.info('Starting MCP server with footnote support...');

  const cachedToolsList = await buildCachedToolsListPayload(registeredTools);
  const port = parseInt(process.env.PORT || '8080', 10);
  await server.start({
    transportType: 'httpStream',
    httpStream: { port, host: '0.0.0.0' },
  });
  installCachedToolsListHandler(server, cachedToolsList);

  logger.info(`MCP Server listening on http://0.0.0.0:${port}`);
} catch (startError: any) {
  logger.error('FATAL: Server failed to start:', startError.message || startError);
  process.exit(1);
}
