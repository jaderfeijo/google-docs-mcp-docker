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

const registeredTools: any[] = [];
collectToolsWhileRegistering(server, registeredTools);

// Register all upstream tools (44 tools)
registerAllTools(server);

// Register our custom footnote tools
registerFootnoteTools(server);

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
