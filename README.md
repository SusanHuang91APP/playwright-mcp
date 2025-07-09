## Playwright MCP

一個使用 [Playwright](https://playwright.dev) 提供瀏覽器自動化功能的模型內容協定 (MCP) 伺服器。此伺服器讓大型語言模型 (LLM) 能夠透過結構化的無障礙樹 (accessibility tree) 快照與網頁互動，無需依賴螢幕截圖或視覺調整模型。

> **注意：** 此專案為微軟官方 [Playwright MCP](https://github.com/microsoft/playwright-mcp) 的修改版本，僅供個人測試使用。更多詳細資訊或官方版本，請參閱[原始專案庫](https://github.com/microsoft/playwright-mcp)。

### 在 Cursor 中安裝

#### 1. 準備專案

首先，將此專案 clone 到您的本地電腦並安裝相依套件：

```bash
git clone https://github.com/91APP/ai-playwright-ui-testing.git
cd ai-playwright-ui-testing
npm install
npm run build
```

#### 2. 手動設定

接著，在 Cursor 中手動設定 MCP 伺服器：

1.  前往 `Cursor 設定` -> `MCP` -> `新增 MCP 伺服器`。
2.  依您的喜好命名。
3.  選擇 `command` 類型。
4.  點擊 `編輯` 並貼上以下 JSON 設定。

**重要：** 請將 `args` 中的路徑修改為您電腦上 `cli.js` 的 **絕對路徑**。

```json
{
  "mcpServers": {
    "playwright-mcp": {
      "command": "/path/to/your/node/version/bin/node",
      "args": [
        "/path/to/your/ai-playwright-ui-testing/cli.js",
        "--isolated",
        "--headless"
      ]
    }
  }
}
```

### 多瀏覽器支援

此版本的 Playwright MCP 採用動態方式管理多瀏覽器。您可以在 MCP 會話中，透過 `browser_create_instance` 工具來建立及管理多個獨立的瀏覽器實例。

#### 1. 建立瀏覽器實例

使用 `browser_create_instance` 工具來啟動一個新的瀏覽器。

- **工具:** `browser_create_instance`
- **描述:** 建立一個新的瀏覽器實例並進行特定設定。
- **參數:**
  - `browserId` (string, optional): 瀏覽器實例的唯一識別碼（若不提供會自動生成）。強烈建議務必主動提供一個有意義且唯一的 ID。
  - `browserType` (enum, optional): 要建立的瀏覽器類型，可選值為 `chromium`、`firefox`、`webkit` (預設為 `chromium`)。
  - `headless` (boolean, optional): 是否以無頭模式運行瀏覽器，會覆蓋啟動時的設定。
  - `userDataDir` (string, optional): 指定儲存使用者資料的目錄路徑。
  - `viewport` (object, optional): 設定瀏覽器的視窗大小，例如 `{ "width": 1280, "height": 720 }`。

> **重要提示：** 在對任何瀏覽器進行操作之前，**您必須先使用 `browser_create_instance` 工具創建一個實例**。直接使用不存在的 `browserId` 呼叫工具將會導致錯誤。

**範例：建立一個名為 `test_browser` 的無頭 Chrome 瀏覽器實例**
```json
{
  "tool": "browser_create_instance",
  "browserId": "test_browser",
  "browserType": "chromium",
  "headless": true
}
```

#### 2. 執行自動化測試

建立瀏覽器實例後，您便可以對其執行各種自動化操作。

在呼叫其他瀏覽器相關工具（如 `browser_navigate`, `browser_click` 等）時，請務必在參數中帶上您先前指定的 `browserId`（在此範例中為 `test_browser`），以確保指令在正確的瀏覽器實例上執行。

#### 3. 管理瀏覽器實例

除了建立實例，您還可以使用以下工具來管理它們：

- **browser_list_instances**:
  - **描述:** 列出所有目前活躍的瀏覽器實例及其狀態。
  - **範例:** `{"tool": "browser_list_instances"}`

- **browser_close_instance**:
  - **描述:** 關閉一個指定的瀏覽器實例。如果提供的 `browserId` 不存在，工具將會回報錯誤。
  - **參數:**
    - `browserId` (string): 要關閉的瀏覽器實例 ID。
  - **範例:** `{"tool": "browser_close_instance", "browserId": "test_browser"}`

- **browser_get_stats**:
  - **描述:** 獲取關於瀏覽器實例的統計資訊，例如總數、最大實例數等。
  - **範例:** `{"tool": "browser_get_stats"}`

#### 4. 自動清理

為了有效管理系統資源，本伺服器具備自動清理機制：
- **閒置超時:** 閒置超過 30 分鐘的瀏覽器實例將會被自動關閉。
- **數量上限:** 系統預設最多同時存在 10 個瀏覽器實例。當達到上限時，最久未被使用的實例將會被關閉，以便為新的實例釋放資源。