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
import { defineTool, withBrowserId, browserIdOnlySchema, type ToolFactory } from './tool.js';

const close: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browser_close',
    title: 'Close the page',
    description: 'Close the page',
    inputSchema: browserIdOnlySchema(),
    type: 'destructive',
  },

  handle: async context => {
    await context.close();

    const code = [
      `// <internal code to close all tabs>`,
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: 'No open pages available. Use the "browser_navigate" tool to navigate to a page first.',
        }],
      },
    };
  },
});

const resize: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browser_resize',
    title: 'Resize the browser window',
    description: 'Resize the browser window',
    inputSchema: withBrowserId(z.object({
      width: z.number().describe('Width of the browser window'),
      height: z.number().describe('Height of the browser window'),
    })),
    type: 'destructive',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    await tab.page.setViewportSize({ width: params.width, height: params.height });

    const code = [
      `// Resize browser window to ${params.width}x${params.height}`,
      `await page.setViewportSize({ width: ${params.width}, height: ${params.height} });`,
    ];

    return {
      code,
      captureSnapshot,
      waitForNetwork: false,
    };
  },
});

export default (captureSnapshot: boolean) => [
  close(captureSnapshot),
  resize(captureSnapshot),
];
