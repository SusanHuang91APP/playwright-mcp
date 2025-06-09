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

const generatePlaywrightTest: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browser_generate_playwright_test',
    title: 'Generate Playwright test',
    description: 'Generate a Playwright test for given scenario',
    inputSchema: withBrowserId(z.object({
      name: z.string().describe('The name of the test'),
      description: z.string().describe('The description of the test'),
      steps: z.array(z.string()).describe('The steps of the test'),
    })),
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const testCode = `
import { test, expect } from '@playwright/test';

test('${params.name}', async ({ page }) => {
  // ${params.description}
  
${params.steps.map(step => `  // ${step}`).join('\n')}
});
`.trim();

    const code = [
      `// Generated Playwright test: ${params.name}`,
      `// Description: ${params.description}`,
    ];

    return {
      code,
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: `Generated Playwright test:\n\n${testCode}`,
        }],
      },
    };
  },
});

export default (captureSnapshot: boolean) => [
  generatePlaywrightTest(captureSnapshot),
];
