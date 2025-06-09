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
    const context = await resolveContext(contextManager, defaultContext, request.params.arguments);

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
  args: any
): Promise<Context> {
  // 如果沒有指定 browserId，使用預設 Context（向後兼容）
  if (!args?.browserId)
    return defaultContext;

  // 如果指定了 browserId，嘗試獲取對應的 Context
  try {
    return await manager.getContext(args.browserId);
  } catch (error) {
    // 如果指定的瀏覽器實例不存在，拋出錯誤
    throw new Error(`Browser instance '${args.browserId}' not found. Use browser_create_instance to create it first.`);
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
