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
import { defineTool, withBrowserId, type ToolFactory } from './tool.js';
import { outputFile } from '../config.js';
import { sanitizeForFilePath } from './utils.js';

const takeScreenshot: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browser_take_screenshot',
    title: 'Take a screenshot',
    description: 'Take a screenshot of the current page. You can\'t perform actions based on the screenshot, use browser_snapshot for actions.',
    inputSchema: withBrowserId(z.object({
      element: z.string().optional().describe('Human-readable element description used to obtain permission to screenshot the element. If not provided, the screenshot will be taken of viewport. If element is provided, ref must be provided too.'),
      ref: z.string().optional().describe('Exact target element reference from the page snapshot. If not provided, the screenshot will be taken of viewport. If ref is provided, element must be provided too.'),
      filename: z.string().optional().describe('File name to save the screenshot to. Defaults to `page-{timestamp}.{png|jpeg}` if not specified.'),
      raw: z.boolean().optional().describe('Whether to return without compression (in PNG format). Default is false, which returns a JPEG image.'),
    })),
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = params.raw ? 'png' : 'jpeg';
    const filename = params.filename || `page-${timestamp}.${extension}`;
    const path = await outputFile(context.config, sanitizeForFilePath(filename));

    if (params.element && params.ref) {
      // Screenshot of specific element
      const snapshot = tab.snapshotOrDie();
      const locator = snapshot.refLocator({ ref: params.ref, element: params.element });
      await locator.screenshot({ type: params.raw ? 'png' : 'jpeg', path });
    } else {
      // Screenshot of full page
      await tab.page.screenshot({
        path,
        type: params.raw ? 'png' : 'jpeg',
        fullPage: true
      });
    }

          const code = [
        `// Take screenshot: ${filename}`,
        params.element
          ? `await page.locator('${params.ref}').screenshot({ path: '${path}', type: '${extension}' });`
          : `await page.screenshot({ path: '${path}', type: '${extension}', fullPage: true });`,
      ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: `Screenshot saved to ${path}`,
        }],
      },
    };
  },
});

export default (captureSnapshot: boolean) => [
  takeScreenshot(captureSnapshot),
];
