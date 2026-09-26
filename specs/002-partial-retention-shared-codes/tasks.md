# Tasks: 部分保留去識別化與跨檔案共用編碼

## Phase 1: Foundational

- [x] T001 擴充型別：`RedactionItem.head/tail`、`MappingEntry.prefix/suffix`、`Pattern.retention`、`PatternConfig.retention`（src/core/types.ts）
- [x] T002 新增 src/core/retention.ts（splitFor、checkRetention、describeRetention、SUGGESTED_RETENTION），並補上單元測試 tests/unit/retention.test.ts

## Phase 2: US1＋US2 部分保留與防呆（P1）

- [x] T003 CodeBook 的 key 納入切分（src/core/codes.ts），並補測試
- [x] T004 detect 與 addManualItem 套用保留設定（src/core/detector.ts）
- [x] T005 outputFor 與編碼表寫入片段、前後綴（src/core/redactor.ts）
- [x] T006 CSV 有保留時才輸出保留欄位，解析時選擇性讀取（src/core/csv.ts），並補測試
- [x] T007 maskItem（src/core/mask.ts）
- [x] T008 pattern-store 讀寫 retention（src/core/pattern-store.ts），並補測試
- [x] T009 規則頁的保留欄與編輯列、即時預覽、套用建議、防呆（src/ui/patterns-view.ts）
- [x] T010 預覽、tooltip、清單改用 maskItem 與 outputFor；手動新增可選保留方式；顯示部分保留提示（src/ui/process-view.ts）
- [x] T011 round-trip 測試：txt、docx、xlsx、pdf 在部分保留下還原後與原文一致（tests/integration/roundtrip-retention.test.ts）

## Phase 3: US3 地址語意保留（P2）

- [x] T012 splitFor 的 city 與 district 模式，以及測試（和 T002 一起完成）

## Phase 4: US4＋US5 共用編碼與匯入（P3）

- [x] T013 CodeBook.seed 與 mergeMappings，並補測試
- [x] T014 buildArchive 附上合併編碼表，清單加上部分保留欄（src/formats/batch.ts）
- [x] T015 上傳畫面的共用編碼與匯入選項、工具列的模式狀態與「下載合併編碼表」（src/ui/process-view.ts）

## Phase 5: Polish

- [x] T016 README 補上部分保留與共用編碼的說明；執行 npm test 與 npm run build

## Phase 6: 修訂 2026-09-26 統一輸出方式

- [x] T017 retention 新增 `preview` 模式與 previewSplit（依各類別的預覽遮罩），並新增 resplitItems（src/core/retention.ts、src/core/detector.ts）
- [x] T018 處理頁的輸出方式面板（全部編碼／同預覽／自訂），自訂模式可逐類別覆寫，工具列顯示目前的輸出方式（src/ui/process-view.ts）
- [x] T019 手動新增只在自訂模式提供保留方式選擇
- [x] T020 測試：各類別同預覽的輸出，以及切換模式後的 round-trip（tests/unit/retention.test.ts）
