# Quickstart: 文件去識別化工具驗證指南

## 前置需求

- Node.js 20+、npm
- 現代桌面瀏覽器（Chrome/Edge/Safari/Firefox）

## 安裝與啟動

```bash
npm install
npm run dev        # 開發伺服器（預設 http://localhost:5173）
npm run build      # 產出純靜態站台至 dist/
npm run preview    # 以靜態方式試跑 dist/
```

## 自動化測試

```bash
npm test           # Vitest：unit + integration（round-trip、規則樣本、CSV）
```

預期：全數通過；其中 `tests/integration/roundtrip-*.test.ts` 驗證 SC-003（去識別化→還原逐字元一致）與 SC-004（編碼唯一、CSV 與標記一一對應）。

## 手動端對端驗證情境

### 情境 1：核心流程（US1）

1. `npm run dev` 開啟首頁「處理」頁籤。
2. 上傳含姓名/身分證/手機/地址的測試 TXT（可用 `tests/fixtures/` 內樣本）。
3. 預期：預覽以類別底色顯示遮罩（如 `王OO`、`0912-***-678`），上方有顏色圖例，滑鼠停留可見原文與輸出標記 `[姓名:xxxxxx]`；勾選「顯示實際輸出標記」可切換；右側清單列出各項目。
4. 點「下載去識別化文件」與「下載編碼表」。
5. 預期：文件格式與上傳相同；`*.mapping.csv` 可用 Excel 開啟、中文正常、每個文件內標記在 CSV 都有對應列（[contracts/mapping-csv.md](contracts/mapping-csv.md)）。

### 情境 2：人工調整（US2）

1. 承情境 1，對一筆誤判項目按「取消」→ 預覽該處恢復原文。
2. 圈選一段未被偵測的文字 → 指定類別 → 出現新標記。
3. 重新下載，確認兩項調整都反映在文件與 CSV。

### 情境 3：還原（US3）

1. 切到「還原」頁籤，上傳情境 1 的去識別化文件＋ CSV。
2. 預期：預覽全部換回原文，下載後與原始文件文字內容一致。
3. 反向測試：故意刪除 CSV 其中一列再還原 → 預期列出無法還原的編碼警告，其餘正常還原。

### 情境 4：規則管理（US4）

1. 切到「偵測規則」頁籤：可見全部內建規則（名稱/類別/regex/範例/開關）。
2. 停用「手機號碼」→ 回「處理」重跑 → 手機不再被標記。
3. 新增自訂規則 `EMP-\d{6}`（類別：識別碼）→ 測試字串即時預覽命中 → 重跑偵測後 `EMP-004521` 被標記。
4. 重新整理頁面 → 規則設定仍保留（[contracts/pattern-schema.md](contracts/pattern-schema.md)）。

### 情境 5：隱私驗證（SC-005）

1. 開 DevTools Network 面板，完整跑一次情境 1–3。
2. 預期:除載入靜態資產（js/css/字型）外，**零**任何含文件內容的網路請求。

### 情境 6：格式與邊界

- 上傳 .docx：下載後以 Word 開啟，樣式/表格保留、敏感處為標記。
- 上傳 .xlsx：下載後以 Excel 開啟，儲存格樣式保留、敏感格為標記；解壓縮 `xl/sharedStrings.xml` 確認不含原始值。
- 上傳掃描型（無文字層）PDF：預期顯示「無法擷取文字」錯誤（FR-004）。
- 上傳 25 MB 檔案：預期拒絕並提示 20 MB 上限（FR-002）。
- 未下載就重新整理：預期出現資料遺失警告（FR-017）。

## 相關文件

- 資料模型：[data-model.md](data-model.md)
- 契約：[contracts/](contracts/)
- 技術決策：[research.md](research.md)
