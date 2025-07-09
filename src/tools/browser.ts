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

import { z } from 'zod';
import { defineTool, type ToolFactory } from './tool.js';
import { getGlobalContextManager } from '../contextManager.js';

const browserCreate: ToolFactory = () => defineTool({
  capability: 'core',
  schema: {
    name: 'browser_create_instance',
    title: 'Create browser instance',
    description: 'Create a new browser instance with specific configuration',
    inputSchema: z.object({
      browserId: z.string().optional().describe('Unique identifier for the browser instance (auto-generated if not provided)'),
      browserType: z.enum(['chromium', 'firefox', 'webkit']).optional().describe('Type of browser to create'),
      headless: z.boolean().optional().describe('Whether to run browser in headless mode'),
      userDataDir: z.string().optional().describe('Directory to store user data'),
      viewport: z.object({
        width: z.number(),
        height: z.number(),
      }).optional().describe('Browser viewport size'),
      proxy: z.object({
        server: z.string(),
        username: z.string().optional(),
        password: z.string().optional(),
      }).optional().describe('Proxy configuration'),
    }),
    type: 'destructive',
  },

  handle: async (context, params) => {
    const manager = getGlobalContextManager();
    if (!manager)
      throw new Error('Context manager not initialized');

    const browserId = await manager.createBrowserInstance(params);

    const code = [
      `// Created browser instance: ${browserId}`,
      `// Configuration: ${JSON.stringify(params, null, 2)}`,
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: [
            '- Ran Playwright code:',
            '```js',
            ...code,
            '```',
          ].join('\n'),
        }],
      },
    };
  },
});

const browserList: ToolFactory = () => defineTool({
  capability: 'core',
  schema: {
    name: 'browser_list_instances',
    title: 'List browser instances',
    description: 'List all active browser instances',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const manager = getGlobalContextManager();
    if (!manager)
      throw new Error('Context manager not initialized');

    const instances = manager.listInstances();
    const stats = manager.getStats();

    const code = [
      `// Browser instances (${instances.length}/${stats.maxInstances}):`,
      ...instances.map(instance =>
        `// - ${instance.browserId}: ${instance.browserType} (last access: ${new Date(instance.lastAccess).toISOString()})`
      ),
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: [
            '- Ran Playwright code:',
            '```js',
            ...code,
            '```',
          ].join('\n'),
        }],
      },
    };
  },
});

const browserClose: ToolFactory = () => defineTool({
  capability: 'core',
  schema: {
    name: 'browser_close_instance',
    title: 'Close browser instance',
    description: 'Close a specific browser instance',
    inputSchema: z.object({
      browserId: z.string().describe('ID of the browser instance to close'),
    }),
    type: 'destructive',
  },

  handle: async (context, params) => {
    const manager = getGlobalContextManager();
    if (!manager)
      throw new Error('Context manager not initialized');

    await manager.closeBrowserInstance(params.browserId);

    const code = [
      `// Closed browser instance: ${params.browserId}`,
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: [
            '- Ran Playwright code:',
            '```js',
            ...code,
            '```',
          ].join('\n'),
        }],
      },
    };
  },
});

const browserStats: ToolFactory = () => defineTool({
  capability: 'core',
  schema: {
    name: 'browser_get_stats',
    title: 'Get browser statistics',
    description: 'Get statistics about browser instances',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const manager = getGlobalContextManager();
    if (!manager)
      throw new Error('Context manager not initialized');

    const stats = manager.getStats();

    const code = [
      `// Browser Statistics:`,
      `// Total instances: ${stats.totalInstances}`,
      `// Max instances: ${stats.maxInstances}`,
      `// Oldest access: ${stats.oldestAccess ? new Date(stats.oldestAccess).toISOString() : 'N/A'}`,
      `// Newest access: ${stats.newestAccess ? new Date(stats.newestAccess).toISOString() : 'N/A'}`,
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: [
            '- Ran Playwright code:',
            '```js',
            ...code,
            '```',
          ].join('\n'),
        }],
      },
    };
  },
});

export default (captureSnapshot: boolean) => [
  browserCreate(captureSnapshot),
  browserList(captureSnapshot),
  browserClose(captureSnapshot),
  browserStats(captureSnapshot),
];
