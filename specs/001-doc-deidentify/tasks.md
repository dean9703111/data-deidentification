# Tasks: 文件去識別化工具

**Input**: Design documents from `/specs/001-doc-deidentify/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Constitution（Development Workflow）明訂「pattern 必須有命中/不命中測試」與「round-trip 必須有自動化測試」，故包含測試任務。標註 **(Sonnet)** 的測試任務由 Sonnet 模型子代理撰寫與驗證（使用者指示）。

**Organization**: 依 user story 分 phase，每個 story 可獨立實作與驗證。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔案、無未完成依賴）
- **[Story]**: 對應 spec.md 的 US1–US4

## Path Conventions

單一 Vite 專案於 repo 根目錄：`src/core/`、`src/formats/`、`src/ui/`、`tests/unit/`、`tests/integration/`、`tests/fixtures/`（見 plan.md）。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 專案初始化與基本結構

- [X] T001 以 Vite vanilla-ts 範本建立專案：`package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`；scripts：`dev`/`build`/`preview`/`test`
- [X] T002 安裝執行期依賴 `pdfjs-dist`、`pdf-lib`、`@pdf-lib/fontkit`、`jszip` 與開發依賴 `vitest`、`jsdom`、`@types/node`，並在 `vite.config.ts` 設定 vitest（environment: jsdom）
- [X] T003 [P] 下載 Noto Sans TC Regular（OFL）至 `public/fonts/NotoSansTC-Regular.otf`，並於 `README.md` 記錄授權
- [X] T004 [P] 建立目錄骨架 `src/core/`、`src/formats/`、`src/ui/`、`tests/unit/`、`tests/integration/`、`tests/fixtures/` 與 `.gitignore`（node_modules、dist）
- [X] T005 [P] 撰寫 `src/styles.css` 基礎版面（頁籤列、雙欄預覽區、標記高亮樣式 `.mark-姓名`…、清單、表單）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 story 共用的核心型別與純邏輯模組

**⚠️ CRITICAL**: 完成前不得開始任何 user story

- [X] T006 定義核心型別於 `src/core/types.ts`：`DocFormat`、`Category`、`LoadedDocument`、`Pattern`、`RedactionItem`、`MappingEntry`、`PatternConfig`（依 data-model.md 與 contracts/pattern-schema.md）
- [X] T007 [P] 實作 `src/core/codes.ts`：`generateCode(used: Set<string>)`（crypto.getRandomValues 6 hex、集合去重）、`buildMarker(category, code)`、`MARKER_REGEX` 與 `parseMarkers(text)`（依 contracts/marker-format.md）
- [X] T008 [P] 實作 `src/core/csv.ts`：RFC 4180 `serializeMapping(entries): string`（含 BOM、CRLF、引號跳脫）與 `parseMapping(text): { entries, errors }`（header 名稱對應、缺欄位/重複 code 報錯；依 contracts/mapping-csv.md）
- [X] T009 [P] 實作 `src/core/twid.ts`：台灣身分證檢核碼驗證 `isValidTwId(id)`
- [X] T010 實作 `src/core/patterns.ts`：內建規則 `zh-name`、`tw-id`（含 twid 驗證）、`tw-mobile`、`tw-landline`、`tw-address`、`email`（各含 name/category/regex/example；姓名規則含常見姓氏表與排除詞表）（依 research.md R5）
- [X] T011 實作 `src/core/detector.ts`：`detect(text, patterns): RedactionItem[]`——逐規則 `gu` 全域比對、驗證函式過濾、重疊裁決（長者優先、同長先開始者優先）、依 start 排序、指派唯一 code
- [X] T012 實作 `src/core/redactor.ts`：`applyRedactions(text, items): { redactedText, mapping: MappingEntry[] }`（僅 active 項目、由後往前取代避免位移錯亂）
- [X] T013 實作 `src/formats/plaintext.ts`：TXT/MD 的 `parse(file) → LoadedDocument` 與 `generate(doc, newText) → Blob`
- [X] T014 實作 `src/formats/index.ts`：副檔名判定 `detectFormat(file)`、20 MB 上限檢查、統一介面 `parseDocument(file)` / `generateDocument(doc, newText)`，先接 plaintext（docx/pdf 於 US1 補上）
- [X] T015 [P] 實作 `src/ui/components.ts`：`el()` DOM helper、`downloadBlob(blob, name)`、檔案拖曳/選擇區、簡易 toast 訊息
- [X] T016 實作 `src/main.ts` 與 `index.html` 三頁籤骨架（處理／偵測規則／還原）、頁籤切換、`beforeunload` 保護（有未下載結果時提醒，FR-017）
- [X] T017 [P] **(Sonnet)** 單元測試 `tests/unit/codes.test.ts`：1000 次產生不重複、格式 `[0-9a-f]{6}`、`parseMarkers` 正反例
- [X] T018 [P] **(Sonnet)** 單元測試 `tests/unit/csv.test.ts`：含逗號/引號/換行原始值的 serialize→parse round-trip、BOM 存在、缺 header 報錯、重複 code 報錯、`\n` 與 `\r\n` 皆可解析
- [X] T019 [P] **(Sonnet)** 單元測試 `tests/unit/twid.test.ts` 與 `tests/unit/patterns.test.ts`：每條內建規則至少 3 個命中、3 個不應命中樣本（身分證檢核碼錯誤者不命中、`0912345678`/`0912-345-678` 命中、`1912345678` 不命中、地址/姓名正反例）
- [X] T020 [P] **(Sonnet)** 單元測試 `tests/unit/detector.test.ts`：重疊裁決（長者優先）、停用規則不產生項目、結果依 start 排序、code 全不重複

**Checkpoint**: 基礎模組完成且單元測試通過，可開始 user stories

---

## Phase 3: User Story 1 - 上傳文件、自動去識別化並下載結果 (Priority: P1) 🎯 MVP

**Goal**: 上傳 PDF/DOCX/TXT/MD → 自動偵測 → 預覽標記 → 下載去識別化文件（格式同輸入）＋ CSV 編碼表

**Independent Test**: 上傳含姓名/身分證/手機/地址的測試檔，預覽顯示 `[類別:code]` 標記，下載文件與 CSV 一一對應（quickstart 情境 1、6）

### Implementation for User Story 1

- [X] T021 [P] [US1] 實作 `src/formats/docx.ts`：jszip 解壓 → DOMParser 解析 `word/document.xml` 與 `word/header*.xml`、`word/footer*.xml` → 走訪 `<w:t>` 建立全文與節點區段對照（段落間以 `\n` 分隔）→ `applyTextEdits(edits)` 支援跨節點取代（寫入首節點、清空其餘、保留 `xml:space="preserve"`）→ 序列化並重新壓縮輸出 Blob（依 research.md R3）
- [X] T022 [P] [US1] 實作 `src/formats/pdf.ts` 解析端：pdfjs-dist（設定 worker URL）逐頁取得 `TextItem`（str、transform、width、height、fontSize），組合為全文（項目間依座標補空白/換行），保留每項目在全文的位移區間；全文為空 → 拋出「無文字層」錯誤（FR-004）
- [X] T023 [US1] 實作 `src/formats/pdf.ts` 產出端：pdf-lib 建立同尺寸頁面、註冊 fontkit、內嵌 `/fonts/NotoSansTC-Regular.otf`（subset），依原座標繪回每個文字項目（被取代的項目繪製新文字），回傳 Blob（依 research.md R2）
- [X] T024 [US1] 在 `src/formats/index.ts` 接上 docx 與 pdf 的 parse/generate，統一以「全文 + 編輯清單（start,end,replacement）」介面驅動各格式產出
- [X] T025 [US1] 實作 `src/ui/process-view.ts` 上傳與偵測：檔案區→`parseDocument`→依啟用規則 `detect`→狀態存於 view；錯誤（格式/大小/無文字層）以 toast 顯示；無偵測結果時顯示「未偵測到敏感資訊」提示
- [X] T026 [US1] 實作 `src/ui/process-view.ts` 預覽區：以文字節點＋`<mark class="mark-類別" data-id>` 渲染去識別化後全文（標記顯示 `[類別:code]`），右側清單列出每筆（類別/原文/編碼）
- [X] T027 [US1] 實作 `src/ui/process-view.ts` 下載：「下載去識別化文件」呼叫 `applyRedactions` + `generateDocument`（檔名 `<name>.deid.<ext>`）；「下載編碼表」呼叫 `serializeMapping`（檔名 `<name>.mapping.csv`）；下載後解除 beforeunload 旗標；PDF 格式時顯示「版面重建、不含圖片」限制提示（FR-020）
- [X] T028 [P] [US1] 建立測試樣本 `tests/fixtures/sample.txt`、`tests/fixtures/sample.md`（含姓名、身分證、手機、市話、地址、Email、重複出現的姓名），以及以程式產生的最小 `tests/fixtures/sample.docx`（含段落、表格、跨 run 拆散的身分證字號）
- [X] T029 [P] [US1] **(Sonnet)** 整合測試 `tests/integration/roundtrip-text.test.ts`：sample.txt 經 detect→applyRedactions 後，文件內標記數 = mapping 筆數、code 全唯一（SC-004），同一姓名多次出現得到不同 code（FR-018），再以 mapping 還原（用 US3 的 restorer 或直接字串取代）逐字元等於原文（SC-003）
- [X] T030 [P] [US1] **(Sonnet)** 整合測試 `tests/integration/roundtrip-docx.test.ts`：sample.docx 經 docx 管線取代後，重新解析文字含標記且原文不存在；`word/styles.xml` 與表格結構未變；還原後全文逐字元一致；跨 run 拆散的身分證能被整體取代

**Checkpoint**: US1 可獨立運作——MVP 完成

---

## Phase 4: User Story 2 - 手動取消與新增去識別化項目 (Priority: P2)

**Goal**: 在預覽中取消誤判、圈選新增漏偵測項目，變更同步反映到下載結果

**Independent Test**: 取消一筆、圈選新增一筆後重新下載，文件與 CSV 同步反映（quickstart 情境 2）

### Implementation for User Story 2

- [X] T031 [US2] 在 `src/core/detector.ts` 新增 `addManualItem(items, text, start, end, category, used): RedactionItem | OverlapError` 與 `toggleItem(items, id)`（重疊檢查、指派新 code）
- [X] T032 [US2] 在 `src/ui/process-view.ts` 清單每列加「取消／加回」按鈕，切換 `active` 後 1 秒內重繪預覽（已取消者以原文＋虛線底線顯示）（FR-014、SC-007）
- [X] T033 [US2] 在 `src/ui/process-view.ts` 實作圈選新增：監聽預覽區 `mouseup` → 由 `window.getSelection()` 的 Range 換算為全文位移（需將預覽 DOM 節點回推到 text offset，標記節點以其原文長度計）→ 浮動小面板選類別→呼叫 `addManualItem`；重疊時 toast 提示（FR-015）
- [X] T034 [US2] 在 `src/ui/process-view.ts` 實作清單點擊定位：捲動預覽至對應 `<mark>` 並閃爍強調（FR-016）
- [X] T035 [P] [US2] **(Sonnet)** 單元測試 `tests/unit/detector.test.ts` 追加：`addManualItem` 重疊拒絕、成功新增取得唯一 code、`toggleItem` 後 `applyRedactions` 不含已取消項目

**Checkpoint**: US1 + US2 可獨立運作

---

## Phase 5: User Story 3 - 上傳編碼表還原文件 (Priority: P3)

**Goal**: 上傳去識別化文件＋CSV，將標記換回原文並下載

**Independent Test**: 用 US1 產出的檔案還原，文字內容與原檔一致；刪除 CSV 一列後還原出現警告（quickstart 情境 3）

### Implementation for User Story 3

- [X] T036 [US3] 實作 `src/core/restorer.ts`：`restore(text, mapping): { restoredText, edits, missingCodes[] }`——以 `MARKER_REGEX` 掃描、查表取代、收集查無 code（FR-023/024）
- [X] T037 [US3] 實作 `src/ui/restore-view.ts`：雙檔上傳（去識別化文件＋CSV）→ `parseMapping`（錯誤即顯示並中止，FR-025）→ `parseDocument` → `restore` → 預覽（還原處高亮）＋無法還原編碼警告清單 → 「下載還原文件」以 `generateDocument` 輸出同格式（檔名 `<name>.restored.<ext>`）
- [X] T038 [P] [US3] **(Sonnet)** 整合測試 `tests/integration/restore-errors.test.ts`：CSV 缺一列 → `missingCodes` 含該 code 且其餘正常還原；CSV 缺 header → parse 回傳錯誤；重複 code → 錯誤；原文本身含 `[姓名:abcdef]` 樣式文字但 CSV 查無 → 原樣保留＋警告
- [X] T039 [US3] 更新 `tests/integration/roundtrip-text.test.ts` 與 `roundtrip-docx.test.ts` 改用 `restorer.restore` 完成還原段（若 T029/T030 先以字串取代實作）

**Checkpoint**: US1–US3 完整 round-trip 可用

---

## Phase 6: User Story 4 - 檢視與管理偵測 Pattern (Priority: P4)

**Goal**: 規則管理頁：檢視全部規則、啟用/停用、自訂規則 CRUD＋即時測試、設定持久化

**Independent Test**: 停用手機規則後重跑不再標記；新增 `EMP-\d{6}` 後命中；重新整理後設定保留（quickstart 情境 4）

### Implementation for User Story 4

- [X] T040 [US4] 實作 `src/core/pattern-store.ts`：`loadConfig()`/`saveConfig()`（key `deid.patternConfig.v1`、version 檢查、解析失敗重置）、`getEffectivePatterns()`（內建＋自訂、套用啟用狀態）、`validateRegex(src)`（`new RegExp(src,'gu')` try/catch）（依 contracts/pattern-schema.md）
- [X] T041 [US4] 實作 `src/ui/patterns-view.ts` 規則清單：表格顯示名稱/類別/regex/範例/來源/啟用開關；切換即 `saveConfig`（FR-009/010）
- [X] T042 [US4] 實作 `src/ui/patterns-view.ts` 自訂規則表單：名稱、類別（下拉）、regex、範例；即時驗證顯示錯誤；「測試字串」欄位即時列出命中片段；儲存/編輯/刪除（僅 custom）（FR-006/011）
- [X] T043 [US4] 將 `src/ui/process-view.ts` 的偵測改為使用 `getEffectivePatterns()`，並提供「重新偵測」按鈕（規則變更後重跑，手動新增項目保留）
- [X] T044 [P] [US4] **(Sonnet)** 單元測試 `tests/unit/pattern-store.test.ts`（jsdom localStorage）：預設全啟用、停用後 `getEffectivePatterns` 不含該規則、自訂規則 save→load round-trip、無效 regex 拒絕、壞 JSON/未知 version 重置、localStorage 中不含任何非設定資料

**Checkpoint**: 全部 user stories 可獨立運作

---

## Phase 7: Polish & Cross-Cutting Concerns

### UX 回饋（2026-09-02，FR-013 修訂）

- [X] T050 實作 `src/core/mask.ts` 的 `maskDisplay(category, original)`（姓名 王OO、手機 0912-***-678、身分證 A12******9、市話 02-****-56、地址 台北市信義區***、Email xi***@example.com、識別碼 EMP***），並在 `src/ui/process-view.ts` 預覽以遮罩取代編碼、加入類別顏色圖例與「顯示實際輸出標記」切換
- [X] T051 實作全域 hover tooltip（`src/ui/components.ts` `installTooltips`，`data-tip` 屬性，掛於 body 不受捲動容器裁切），標記顯示類別／原文／輸出標記
- [X] T052 修正 `src/ui/patterns-view.ts` 規則表格在窄寬度下的破版：類別／來源標籤 nowrap 置中、表格 min-width 改為橫向捲動
- [X] T053 [P] **(Sonnet)** 單元測試 `tests/unit/mask.test.ts`：每個類別的遮罩格式、複姓、+886 手機、短字串邊界、遮罩不得等於原文

### Excel 支援與交付物（2026-09-02，FR-001 修訂）

- [X] T054 實作 `src/formats/xlsx.ts`（依 research.md R3b）：工作表順序、共用字串/inline/rich text 擷取、被取代儲存格改寫為 inline string、未引用共用字串清空；接上 `src/formats/index.ts`、`DocFormat`、UI 提示與限制說明
- [X] T055 [P] 測試工具 `tests/helpers/xlsx-builder.ts`（共用字串去重、inline、rich text、數值格、多工作表）與 `tests/fixtures/sample.xlsx`
- [X] T056 [P] **(Sonnet)** 整合測試 `tests/integration/roundtrip-xlsx.test.ts`：文字擷取順序、同值多格不同編碼、styles 不變、inline string 改寫、壓縮檔內零殘留（回歸）、還原一致、冪等、多工作表順序、無 sharedStrings、非 xlsx 拒絕
- [X] T057 [P] 範例測試檔 `examples/`（`scripts/make-examples.ts`，`npm run examples`）：情境 1–6 各自對應的檔案與 `examples/README.md`
- [X] T058 README 操作流程：`scripts/make-screenshots.ts`（puppeteer-core + 本機 Chrome，`npm run screenshots`）產生 `docs/screenshots/01–07`，頁面上注入紅框與編號；README 新增七步驟操作說明、範例檔說明、Excel 格式限制
- [X] T059 姓名規則改為「後綴白名單優先、否則退回排除虛詞的雙字比對」（修正「王小明接待」類漏抓），並補停用詞

### 真實案例範例與 PDF 字型修正（2026-09-02）

- [X] T060 文件模型與渲染器 `scripts/lib/`（docmodel、render-docx（樣式、頁首頁尾頁碼、表格、分頁、依 script 拆 run）、render-pdf（換行、表格框線、分頁、頁碼）、fake（固定種子假資料：合法檢核碼身分證、電話、地址、統編、Email）、documents（4 頁委外服務契約書、4 頁報價單、客戶資料 60 筆三工作表、客服信件、會議紀錄））
- [X] T061 `examples/01-核心流程` 改為真實案例（Word+PDF 各兩份、Excel、txt、md）；`03-還原` 改用 Word 合約書成對檔；`examples/README.md` 重寫；截圖改用合約書
- [X] T062 修正 PDF 輸出字型：pdf-lib 子集在 macOS 預覽程式顯示亂碼 → 改用 TTF + `src/formats/ttf-subset.ts` 稀疏子集（research.md R10 修訂）；取代文字寬度改以頁面右邊界為上限避免整行縮小
- [X] T063 姓名規則：驗證函式可讀前文，「甲方／乙方／雙方／各方…」的「方」不視為姓氏；補停用詞（管轄、溫濕、何疑、易雙、謝您…）
- [X] T064 **(Sonnet)** 整合測試 `tests/integration/roundtrip-realistic.test.ts`：合約書／報價單（docx+pdf，4 頁）、客戶資料（60 筆）、信件、會議紀錄的偵測完整性（身分證／Email／手機 100%）與 round-trip

### 格式感知預覽與貼上文字（2026-09-02，FR-013b / FR-001b）

- [X] T065 解析器輸出版面資訊 `LoadedDocument.layout`（docx：段落樣式／表格座標／頁首頁尾；xlsx：工作表名稱與儲存格座標；pdf：每頁文字項目座標）
- [X] T066 `src/ui/preview.ts` 共用渲染器：`renderRange` 以全文位移切片渲染標記（跨界裁切）；Word 頁面式、Excel 格線＋工作表頁籤、PDF 逐頁絕對定位（依原寬度 scaleX 校正）；處理頁與還原頁共用；「純文字檢視」切換
- [X] T067 貼上文字輸入框（Ctrl/⌘+Enter 送出）與「複製去識別化文字」按鈕（txt/md）
- [X] T068 **(Sonnet)** 單元測試 `tests/unit/preview.test.ts`：plain／docx／xlsx／pdf 渲染、跨界裁切、工作表切換、重新渲染清空
- [X] T069 新增內建類別「公司」（組織後綴比對＋前置虛詞排除）與「統編」（8 位數＋統一編號檢核碼 `isValidTaxId`）；遮罩、顏色、假資料產生器同步更新（FR-005 修訂）
- [X] T070 **(Sonnet)** 單元測試：`isValidTaxId` 正反例、`tw-company`／`tw-tax-id` 命中與不命中樣本、公司與統編遮罩
- [X] T072 市話規則修正：無分隔形式依區碼要求正確位數（02/04 十碼、其餘九碼），8 位數統一編號不再被市話規則搶先命中（Sonnet 測試代理發現）
- [X] T073 批量上傳（FR-001c）：`process-view` 改為多文件狀態（每檔獨立 items／used／下載狀態）、上限 10 個與提示、左側檔案面板（切換／加入／移除）、貼上文字可多次加入、種類整批取消套用全部檔案
- [X] T074 `src/formats/batch.ts`：`buildArchive` 打包全部去識別化檔＋編碼表＋`清單.csv`（同名檔以 (2)(3) 區分）；工具列「打包下載全部」
- [X] T075 **(Sonnet)** 整合測試 `tests/integration/batch-archive.test.ts`：唯一命名、清單 CSV、ZIP 內容與每個檔案的 round-trip
- [X] T071 互動調整（FR-014／FR-016 修訂）：點擊標記彈出確認視窗（取消／加回）；圖例改為「去識別化種類」並可點擊整批取消（刪除線）／復原，重新偵測後沿用；偵測清單預設收合可展開；下載與複製按鈕移至上方工具列

- [X] T045 [P] 撰寫 `README.md`：功能、隱私聲明（純前端零上傳）、格式限制（PDF 版面重建/無 OCR/僅 .docx）、開發與部署指令、字型授權
- [X] T046 [P] 在處理頁加入偵測到原文含標記樣式文字時的警告（spec Edge Case；掃描 `MARKER_REGEX` 於原文）
- [X] T047 執行 `npm run build` 並確認 `dist/` 以 `npm run preview` 可正常運作、pdfjs worker 與字型資產路徑正確（相對路徑 `base: './'`）
- [X] T048 **(Sonnet)** 依 `specs/001-doc-deidentify/quickstart.md` 情境 1–6 以瀏覽器做端對端驗證（含 DevTools Network 確認零文件內容請求，SC-005），將結果記錄於 `specs/001-doc-deidentify/checklists/e2e-validation.md`
- [X] T049 **(Sonnet)** 執行 `npm test` 全套並修正失敗；補齊覆蓋率缺口（每條內建規則皆有正反樣本）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴
- **Foundational (Phase 2)**: 依賴 Phase 1；阻擋所有 story。T006 先行，T007–T009 平行，T010→T011→T012 循序，T013→T014，T015/T016 可與 core 平行；測試 T017–T020 於對應模組完成後平行執行
- **US1 (Phase 3)**: 依賴 Phase 2。T021/T022 平行；T023 依賴 T022；T024 依賴 T021/T023；T025→T026→T027 循序；T028 可提早；T029/T030 依賴 T024/T028
- **US2 (Phase 4)**: 依賴 US1 的 process-view（T025–T027）
- **US3 (Phase 5)**: 依賴 Phase 2（restorer 與 csv/formats），UI 獨立於 US1/US2；T039 依賴 T036
- **US4 (Phase 6)**: 依賴 Phase 2；T043 依賴 US1 的 process-view
- **Polish (Phase 7)**: 依賴所有 story

### Parallel Opportunities

- Phase 1：T003、T004、T005 平行
- Phase 2：T007、T008、T009 平行；T015 與 core 平行；T017–T020 四個測試檔平行（Sonnet 子代理可同時啟動）
- Phase 3：T021 與 T022 平行（docx vs pdf）；T028 與所有實作平行；T029、T030 平行
- 跨 story：US3（T036–T038）與 US4（T040–T042）可在 Phase 2 完成後與 US1 平行開發

---

## Parallel Example: Phase 2 測試（Sonnet 子代理）

```text
Agent(model=sonnet): "撰寫 tests/unit/codes.test.ts 依 T017 規格，執行 npm test 直到通過"
Agent(model=sonnet): "撰寫 tests/unit/csv.test.ts 依 T018 規格，執行 npm test 直到通過"
Agent(model=sonnet): "撰寫 tests/unit/twid.test.ts 與 patterns.test.ts 依 T019 規格"
Agent(model=sonnet): "撰寫 tests/unit/detector.test.ts 依 T020 規格"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Phase 1 Setup → Phase 2 Foundational（含單元測試）
2. Phase 3 US1 → 以 quickstart 情境 1 驗證 → 可展示的 MVP

### Incremental Delivery

1. US1（MVP）→ US2（人工覆核，品質保證）→ US3（還原，完成 round-trip）→ US4（規則管理）
2. 每個 story 完成後跑 `npm test` 確認前面 story 不退化
3. Phase 7 收尾：build、E2E 驗證、README

---

## Notes

- 測試任務標註 (Sonnet) 者交由 Sonnet 模型子代理執行；主線實作由主代理完成
- 全文位移（offset）是所有格式的共同座標系；任何取代都以「編輯清單（start,end,replacement）」表達，由各格式模組自行映射回原始結構
- PDF 產出絕不使用覆蓋法（隱藏文字洩漏），一律重建（research.md R2）
