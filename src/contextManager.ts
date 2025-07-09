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

import { Context } from './context.js';
import { contextFactory } from './browserContextFactory.js';
import type { Tool } from './tools/tool.js';
import type { FullConfig } from './config.js';

export interface BrowserInstanceConfig {
  id?: string;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

export interface ContextManagerOptions {
  maxInstances?: number;
  instanceTimeout?: number; // 閒置超時時間（毫秒）
  cleanupInterval?: number; // 清理檢查間隔（毫秒）
}

interface ManagedContext {
  browserId: string;
  context: Context;
  config: BrowserInstanceConfig;
  lastAccess: number;
  browserType: string;
}

export class ContextManager {
  private _contexts: Map<string, ManagedContext> = new Map();
  private _cleanupTimer: NodeJS.Timeout | null = null;
  private _options: Required<ContextManagerOptions>;
  private _tools: Tool[];
  private _baseConfig: FullConfig;

  constructor(tools: Tool[], baseConfig: FullConfig, options: ContextManagerOptions = {}) {
    this._tools = tools;
    this._baseConfig = baseConfig;
    this._options = {
      maxInstances: options.maxInstances || 10,
      instanceTimeout: options.instanceTimeout || 30 * 60 * 1000, // 30分鐘
      cleanupInterval: options.cleanupInterval || 5 * 60 * 1000, // 5分鐘
    };

    // 啟動清理定時器
    this._startCleanupTimer();
  }

  /**
   * 創建新的瀏覽器實例
   */
  async createBrowserInstance(config: BrowserInstanceConfig = {}): Promise<string> {
    const browserId = config.id || this._generateId();

    // 檢查是否超過最大實例數
    if (this._contexts.size >= this._options.maxInstances)
      await this._cleanupOldestInstance();

    // 檢查 ID 是否已存在
    if (this._contexts.has(browserId))
      throw new Error(`Browser instance with ID '${browserId}' already exists`);

    // 創建配置對象
    const browserConfig = {
      ...this._baseConfig.browser,
      browserName: (config.browserType || 'chromium') as 'chromium' | 'firefox' | 'webkit',
      launchOptions: {
        ...this._baseConfig.browser.launchOptions,
        headless: config.headless ?? this._baseConfig.browser.launchOptions?.headless,
      },
      contextOptions: {
        ...this._baseConfig.browser.contextOptions,
        viewport: config.viewport,
        proxy: config.proxy,
      },
      userDataDir: config.userDataDir,
    };

    // 創建瀏覽器上下文工廠
    const browserContextFactory = contextFactory(browserConfig);

    // 創建新的 Context
    const context = new Context(this._tools, this._baseConfig, browserContextFactory);

    // 存儲管理的上下文
    const managedContext: ManagedContext = {
      browserId,
      context,
      config,
      lastAccess: Date.now(),
      browserType: config.browserType || 'chromium',
    };

    this._contexts.set(browserId, managedContext);

    return browserId;
  }

  /**
   * 根據 ID 獲取 Context
   */
  async getContext(browserId: string): Promise<Context> {
    const managedContext = this._contexts.get(browserId);
    if (!managedContext)
      throw new Error(`Browser instance with ID '${browserId}' not found`);

    // 更新最後訪問時間
    managedContext.lastAccess = Date.now();

    return managedContext.context;
  }

  /**
   * 列出所有瀏覽器實例
   */
  listInstances(): Array<{
    browserId: string;
    browserType: string;
    lastAccess: number;
    config: BrowserInstanceConfig;
  }> {
    return Array.from(this._contexts.values()).map(managed => ({
      browserId: managed.browserId,
      browserType: managed.browserType,
      lastAccess: managed.lastAccess,
      config: managed.config,
    }));
  }

  /**
   * 關閉指定的瀏覽器實例
   */
  async closeBrowserInstance(id: string): Promise<void> {
    const managedContext = this._contexts.get(id);
    if (managedContext) {
      await managedContext.context.close();
      this._contexts.delete(id);
    }
  }

  /**
   * 關閉所有瀏覽器實例
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this._contexts.values()).map(managed =>
      managed.context.close()
    );
    await Promise.all(closePromises);

    this._contexts.clear();

    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  /**
   * 檢查實例是否存在
   */
  hasInstance(id: string): boolean {
    return this._contexts.has(id);
  }

  /**
   * 獲取實例統計信息
   */
  getStats(): {
    totalInstances: number;
    maxInstances: number;
    oldestAccess: number | null;
    newestAccess: number | null;
    } {
    const accessTimes = Array.from(this._contexts.values()).map(m => m.lastAccess);

    return {
      totalInstances: this._contexts.size,
      maxInstances: this._options.maxInstances,
      oldestAccess: accessTimes.length > 0 ? Math.min(...accessTimes) : null,
      newestAccess: accessTimes.length > 0 ? Math.max(...accessTimes) : null,
    };
  }

  /**
   * 生成唯一 ID
   */
  private _generateId(): string {
    return `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 啟動清理定時器
   */
  private _startCleanupTimer(): void {
    this._cleanupTimer = setInterval(() => {
      void this._cleanupExpiredInstances();
    }, this._options.cleanupInterval);
  }

  /**
   * 清理過期的實例
   */
  private async _cleanupExpiredInstances(): Promise<void> {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, managed] of this._contexts.entries()) {
      if (now - managed.lastAccess > this._options.instanceTimeout)
        expiredIds.push(id);
    }

    for (const id of expiredIds)
      await this.closeBrowserInstance(id);

  }

  /**
   * 清理最舊的實例
   */
  private async _cleanupOldestInstance(): Promise<void> {
    if (this._contexts.size === 0)
      return;

    let oldestId = '';
    let oldestTime = Date.now();

    for (const [id, managed] of this._contexts.entries()) {
      if (managed.lastAccess < oldestTime) {
        oldestTime = managed.lastAccess;
        oldestId = id;
      }
    }

    if (oldestId)
      await this.closeBrowserInstance(oldestId);

  }
}

// 全局 ContextManager 實例
let globalContextManager: ContextManager | null = null;

/**
 * 獲取全局 ContextManager 實例
 */
export function getGlobalContextManager(): ContextManager | null {
  return globalContextManager;
}

/**
 * 設置全局 ContextManager 實例
 */
export function setGlobalContextManager(manager: ContextManager): void {
  globalContextManager = manager;
}

/**
 * 清除全局 ContextManager 實例
 */
export function clearGlobalContextManager(): void {
  globalContextManager = null;
}
