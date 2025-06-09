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

const waitFor: ToolFactory = captureSnapshot => defineTool({
  capability: 'wait',

  schema: {
    name: 'browser_wait_for',
    title: 'Wait for text or time',
    description: 'Wait for text to appear or disappear or a specified time to pass',
    inputSchema: withBrowserId(z.object({
      text: z.string().optional().describe('The text to wait for'),
      textGone: z.string().optional().describe('The text to wait for to disappear'),
      time: z.number().optional().describe('The time to wait in seconds'),
    })),
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    let resultText = '';
    const code: string[] = [];

    if (params.text) {
      await tab.page.waitForFunction(text => document.body.innerText.includes(text), params.text);
      resultText += `Text "${params.text}" appeared. `;
      code.push(`// Wait for text "${params.text}" to appear`);
      code.push(`await page.waitForFunction((text) => document.body.innerText.includes(text), '${params.text}');`);
    }

    if (params.textGone) {
      await tab.page.waitForFunction(text => !document.body.innerText.includes(text), params.textGone);
      resultText += `Text "${params.textGone}" disappeared. `;
      code.push(`// Wait for text "${params.textGone}" to disappear`);
      code.push(`await page.waitForFunction((text) => !document.body.innerText.includes(text), '${params.textGone}');`);
    }

    if (params.time) {
      await tab.page.waitForTimeout(params.time * 1000);
      resultText += `Waited for ${params.time} seconds. `;
      code.push(`// Wait for ${params.time} seconds`);
      code.push(`await page.waitForTimeout(${params.time * 1000});`);
    }

    return {
      code,
      captureSnapshot,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: resultText || 'No wait action specified',
        }],
      },
    };
  },
});

export default (captureSnapshot: boolean) => [
  waitFor(captureSnapshot),
];
