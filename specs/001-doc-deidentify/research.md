# Research: 文件去識別化工具

**Date**: 2026-09-02 | **Feature**: [spec.md](spec.md)

## R1. 語言與建置工具

- **Decision**: TypeScript + Vite（vanilla，不用 UI 框架）+ Vitest。
- **Rationale**: 文件解析與位移計算邏輯複雜，型別安全能顯著降低錯誤；Vite 提供開發伺服器與純靜態打包輸出（符合 constitution「可純靜態部署」）；UI 為單頁三個頁籤，vanilla DOM 即可維護，符合「簡單優先」。Vitest 與 Vite 同生態，零額外設定。
- **Alternatives considered**:
  - 純 HTML + CDN script：無測試基礎設施、無型別，解析邏輯品質難保證 → 否決。
  - React/Vue：對三頁籤 UI 是不必要的複雜度 → 否決。

## R2. PDF 解析與輸出

- **Decision**: 解析用 `pdfjs-dist`（Mozilla PDF.js，取得每頁文字項目與座標）；輸出用 `pdf-lib` + `@pdf-lib/fontkit` 重建「純文字版面」PDF——每頁同尺寸、文字依原座標繪回，敏感片段換成編碼標記；內嵌 Noto Sans TC 字型（輸出時 subset）。
- **Rationale**:
  - **安全性否決了覆蓋法（overlay）**：在原 PDF 上畫白色矩形再壓上編碼，原始敏感文字仍存在於 content stream，複製貼上即洩漏——這是經典的「假遮蔽」事故，違反 constitution 原則 I/II 的精神。
  - 直接編輯 PDF content stream 移除特定文字運算子過於複雜且易錯 → 超出 v1。
  - 文字重建法保證輸出檔內完全不含原始敏感值，版面座標盡量貼近原件；圖片/圖形/字型無法保留，此限制已在 spec Assumptions 揭露並需在 UI 上揭露（FR-020）。
- **Alternatives considered**: 白框覆蓋法（洩漏風險，否決）、content stream 編輯（複雜度過高，否決）、一律輸出純文字（使用者已明確選擇盡量保留格式，否決）。

## R3. Word (.docx) 解析與輸出

- **Decision**: 把 .docx 當 ZIP 處理：`jszip` 解壓 → 以瀏覽器內建 `DOMParser` 解析 `word/document.xml`（含 `word/header*.xml`、`word/footer*.xml`）→ 走訪 `<w:t>` 文字節點建立「全文 ↔ 節點區段」對照 → 直接在 XML 文字節點上做跨節點取代 → `XMLSerializer` 序列化後重新壓回 ZIP。輸出即為 .docx。
- **Rationale**: 只動文字節點、不動任何樣式/表格/版面結構，**格式 100% 保留**，是「盡量保留原格式」在 Word 上的最佳解；還原時同法把標記換回原文。敏感值常被 Word 拆散在多個相鄰 `<w:t>` run 中，故需要全文對照表支援跨節點取代（取代結果寫入第一個節點、清空其餘覆蓋節點）。
- **Alternatives considered**:
  - `mammoth`（docx→HTML）：單向轉換，無法輸出回 .docx → 否決。
  - `docx`（重建文件）：需重建所有樣式，必然掉格式 → 否決。

## R3b. Excel (.xlsx) 解析與輸出（2026-09-02 新增）

- **Decision**: 與 R3 同一套 ZIP+XML 管線。解析時依 `xl/workbook.xml` 的工作表順序走訪每個 `<c>`：`t="s"` 查 `xl/sharedStrings.xml`（含 rich text `<r><t>` 串接）、`t="inlineStr"` 讀 `<is>`；同列儲存格以 `\t`、跨列以 `\n` 接成全文。輸出時被取代的儲存格改寫為 inline string（保留 `r`、`s` 屬性），**並把所有不再被任何儲存格引用的共用字串清空**（保留索引位置）。
- **Rationale**: 改寫成 inline string 讓「同值多格」的儲存格各自取得不同編碼（符合 FR-018），且不需重排 sharedStrings 索引；未引用的共用字串若不清空，原始值會以孤兒項目留在壓縮檔內（由 Sonnet 測試代理發現的實際外洩），故必須清除。每次產生都從解析時保存的原始 sharedStrings 出發，避免重複下載時誤清仍需要的字串。
- **Alternatives considered**: 直接改寫 sharedStrings 內容（同值多格會共用編碼，違反 FR-018）；使用 SheetJS 等套件重建工作簿（樣式易流失、依賴大）→ 否決。

## R4. TXT / Markdown 處理

- **Decision**: 直接以字串處理；Markdown 不渲染，預覽一律以純文字＋標記高亮呈現。
- **Rationale**: 渲染 Markdown 會使「畫面位置 ↔ 原文位移」對照複雜化，且與去識別化任務無關；純文字預覽簡單、精確、可圈選。

## R5. 偵測引擎與內建規則

- **Decision**: 以 JavaScript `RegExp`（`gu` flags）為規則引擎，對擷取後全文執行；每條規則＝{名稱、類別、regex、驗證函式(選用)、範例}。內建規則：
  - **身分證字號**: `[A-Z][12]\d{8}` ＋ 檢核碼驗證（過檢核才算命中，消除誤判）。
  - **手機號碼**: `09\d{8}` 及常見分隔寫法（`09xx-xxx-xxx`、`09xx xxx xxx`）。
  - **市話號碼**: 區碼（02–08 系列）＋分隔符變體，例如 `(02)2712-3456`、`02-27123456`。
  - **電子郵件**: 標準 email regex。
  - **地址**: 台灣地址結構 regex（縣市＋鄉鎮市區＋村里/路街巷弄＋號樓）。
  - **中文姓名**: 台灣常見姓氏表（含複姓）＋ 1–2 字名的 regex，輔以排除詞表；先天無法零誤判/零漏抓 → 由 US2 人工覆核補足（spec 已載明）。
  - **特定識別碼**: 無內建，由使用者自訂 regex。
- **Rationale**: regex 引擎讓內建與自訂規則走同一條路（FR-006/011 的自訂規則即使用者輸入的 regex）；檢核碼等程式驗證僅內建規則使用。重疊命中以「較長者優先，同長取先開始者」解決（FR-008）。
- **Alternatives considered**: NLP/NER 模型（需大型模型下載、超出簡單優先；且仍需人工覆核）→ 否決，v2 可再評估。

## R6. 編碼（hash）產生

- **Decision**: 每個出現位置產生一個 6 字元十六進位隨機碼（`crypto.getRandomValues`），以集合保證單次輸出內不重複；標記格式 `[類別:編碼]`（例 `[姓名:a3f9c2]`）。
- **Rationale**: 使用者已確認「每次出現不同碼」；隨機碼與原文無數學關聯，滿足 FR-019（不可反推）。6 hex ≈ 1,600 萬組合，對單一文件的量級（≤數千筆）碰撞可忽略且有集合去重兜底。
- **Alternatives considered**: 對原文做 SHA-256 截斷（同值同碼，與使用者決策相反；且理論上可被字典攻擊反推常見姓名）→ 否決。

## R7. 編碼對照表 CSV

- **Decision**: 自寫小型 RFC 4180 CSV writer/parser（引號跳脫、跨行值）；欄位 `code,category,original`；輸出 UTF-8 含 BOM。
- **Rationale**: 原始值可能含逗號、引號、換行（地址、自訂識別碼），必須正確引號處理；BOM 確保 Excel 開啟中文不亂碼（spec Assumption）。依賴一個 CSV 套件對這種小需求不符合簡單優先。

## R8. 還原流程

- **Decision**: 還原模式依上傳的去識別化檔案格式處理：TXT/MD 直接字串取代標記；.docx 走 R3 同一條 XML 文字節點管線；PDF 以 pdfjs 抽文字＋座標後換回原文再以 R2 管線重建。以 regex 掃描 `[類別:編碼]` 標記，查 CSV 對照表替換；查無的編碼列入警告清單（FR-024）。
- **Rationale**: 與去識別化共用同一套格式管線，round-trip 對稱性最高（constitution 原則 II）。

## R9. 規則設定持久化

- **Decision**: `localStorage` 僅存規則設定（自訂規則＋各規則啟用狀態）；文件內容與對照表一律不落地。
- **Rationale**: 符合 FR-012 與 constitution Security Requirements 的明文限制。

## R10. 中文字型（PDF 輸出用）

- **Decision**: 隨站台附上 Noto Sans TC Regular（**TrueType .ttf**）作為靜態資產；輸出時以自製的稀疏子集（`src/formats/ttf-subset.ts`：保留所有表格與原始 glyph ID，只清空未用字形的外框，含複合字形元件）產生小型字型後以 `subset: false` 內嵌。
- **Rationale**: pdf-lib 標準 14 字型不支援 CJK，輸出中文必須自帶字型；Noto Sans TC 為 OFL 授權可自由散布。（2026-09-02 修訂）原本採 OTF + pdf-lib `subset: true`，實測 pdf-lib/fontkit 對大型 CJK 字型（CFF 與 TrueType 皆然）的子集輸出在 macOS 預覽程式／QuickLook 渲染成亂碼或缺字；完整內嵌可正常渲染但每份 PDF 多 4 MB。稀疏子集不重新編號 glyph，因此對任何渲染器都是合法字型，輸出 PDF 約 200–300 KB，且處理僅需數毫秒。
- **Alternatives considered**: 完整內嵌（體積過大）；改用其他 TTF 字型（子集問題相同）；重寫完整子集器（需重映射 cmap/hmtx/loca，風險高）→ 否決。

## R11. 測試策略

- **Decision**: Vitest。單元測試：各內建規則（命中＋不應命中樣本）、身分證檢核碼、編碼唯一性、CSV writer/parser round-trip、docx XML 跨節點取代。整合測試：TXT 與 .docx 的「去識別化→還原」round-trip 逐字元一致；PDF 管線以文字內容一致性驗證。測試撰寫與驗證由 Sonnet 子代理執行（使用者指定）。
- **Rationale**: constitution Development Workflow 明訂 pattern 測試與 round-trip 測試為必要項。
