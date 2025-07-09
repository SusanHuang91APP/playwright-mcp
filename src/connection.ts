/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { Context } from './context.js';
import { snapshotTools, visionTools } from './tools.js';
import { packageJSON } from './package.js';
import { ContextManager, setGlobalContextManager } from './contextManager.js';

import { FullConfig } from './config.js';

import type { BrowserContextFactory } from './browserContextFactory.js';

export function createConnection(config: FullConfig, browserContextFactory: BrowserContextFactory): Connection {
  const allTools = config.vision ? visionTools : snapshotTools;
  const tools = allTools.filter(tool => !config.capabilities || tool.capability === 'core' || config.capabilities.includes(tool.capability));

  // 創建 ContextManager
  const contextManager = new ContextManager(tools, config);
  setGlobalContextManager(contextManager);

  // 創建預設 Context（向後兼容）
  const defaultContext = new Context(tools, config, browserContextFactory);

  const server = new McpServer({ name: 'Playwright', version: packageJSON.version }, {
    capabilities: {
      tools: {},
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.schema.name,
        description: tool.schema.description,
        inputSchema: zodToJsonSchema(tool.schema.inputSchema),
        annotations: {
          title: tool.schema.title,
          readOnlyHint: tool.schema.type === 'readOnly',
          destructiveHint: tool.schema.type === 'destructive',
          openWorldHint: true,
        },
      })) as McpTool[],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const errorResult = (...messages: string[]) => ({
      content: [{ type: 'text', text: messages.join('\n') }],
      isError: true,
    });
    const tool = tools.find(tool => tool.schema.name === request.params.name);
    if (!tool)
      return errorResult(`Tool "${request.params.name}" not found`);

    // 🔑 關鍵：根據請求參數解析 Context
    const context = await resolveContext(contextManager, defaultContext, request.params.arguments, request.params.name);

    const modalStates = context.modalStates().map(state => state.type);
    if (tool.clearsModalState && !modalStates.includes(tool.clearsModalState))
      return errorResult(`The tool "${request.params.name}" can only be used when there is related modal state present.`, ...context.modalStatesMarkdown());
    if (!tool.clearsModalState && modalStates.length)
      return errorResult(`Tool "${request.params.name}" does not handle the modal state.`, ...context.modalStatesMarkdown());

    try {
      return await context.run(tool, request.params.arguments);
    } catch (error) {
      return errorResult(String(error));
    }
  });

  return new Connection(server, contextManager, defaultContext);
}

/**
 * 根據請求參數解析 Context
 */
async function resolveContext(
  manager: ContextManager,
  defaultContext: Context,
  args: any,
  toolName?: string
): Promise<Context> {
  // 🔑 特殊處理：`browser_create_instance` 工具總是使用 `defaultContext`。
  // 這是因為它是一個元操作(meta-operation)，用於創建新的瀏覽器上下文，而不是在某個現有上下文中執行。
  // 如果沒有指定 `browserId`，也會使用預設 Context，以保持向後兼容性。
  if (!args?.browserId || toolName === 'browser_create_instance')
    return defaultContext;

  // 如果指定了 `browserId`，則嘗試獲取對應的 Context。
  // 如果找不到，將拋出一個明確的錯誤，強制使用者必須先創建實例。
  try {
    return await manager.getContext(args.browserId);
  } catch (error) {
    throw new Error(`Browser instance '${args.browserId}' not found. Use the 'browser_create_instance' tool to create it first.`);
  }
}

export class Connection {
  readonly server: McpServer;
  readonly contextManager: ContextManager;
  readonly defaultContext: Context;

  constructor(server: McpServer, contextManager: ContextManager, defaultContext: Context) {
    this.server = server;
    this.contextManager = contextManager;
    this.defaultContext = defaultContext;
    this.server.oninitialized = () => {
      this.defaultContext.clientVersion = this.server.getClientVersion();
    };
  }

  async close() {
    await this.server.close();
    await this.contextManager.closeAll();
    await this.defaultContext.close();
  }
}
