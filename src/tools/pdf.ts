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

const savePdf: ToolFactory = captureSnapshot => defineTool({
  capability: 'pdf',

  schema: {
    name: 'browser_pdf_save',
    title: 'Save page as PDF',
    description: 'Save page as PDF',
    inputSchema: withBrowserId(z.object({
      filename: z.string().optional().describe('File name to save the pdf to. Defaults to `page-{timestamp}.pdf` if not specified.'),
    })),
    type: 'destructive',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = params.filename || `page-${timestamp}.pdf`;
    const path = await outputFile(context.config, sanitizeForFilePath(filename));

    await tab.page.pdf({ path });

    const code = [
      `// Save page as PDF: ${filename}`,
      `await page.pdf({ path: '${path}' });`,
    ];

    return {
      code,
      captureSnapshot,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: `PDF saved to ${path}`,
        }],
      },
    };
  },
});

export default (captureSnapshot: boolean) => [
  savePdf(captureSnapshot),
];
