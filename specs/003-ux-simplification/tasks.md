# Tasks: 去識別化流程的 UI／UX 簡化

## Phase 1: Core

- [x] T001 新增 previewLabel（src/core/redactor.ts）與 setCategoryRetention（src/core/pattern-store.ts），移除 SUGGESTED_RETENTION，並補單元測試

## Phase 2: US1 下載（P1）

- [x] T002 DocState 加入版本追蹤；主要下載按鈕一次下載兩份；「更多」選單；版本不一致時提示（src/ui/process-view.ts）

## Phase 3: US2 預覽等於輸出（P1）

- [x] T003 預覽、清單、標記視窗改用 previewLabel；移除「顯示實際輸出標記」；「純文字檢視」移到預覽標題列

## Phase 4: US3 單一設定入口（P2）

- [x] T004 輸出方式面板改為可收合，附摘要、模式改名與範例
- [x] T005 類別表合併類別開關、筆數、保留控制、行內訊息；移除圖例列
- [x] T006 自訂模式的「設為預設」；規則頁「保留」欄改為唯讀（src/ui/patterns-view.ts）
- [x] T007 手動新增移除逐筆保留選單

## Phase 5: US4＋US5（P3）

- [x] T008 整批共用編碼與匯入編碼表可在處理中切換（rebuildBooks）
- [x] T009 工具列精簡、狀態列合併（含 ⓘ 格式限制）

## Phase 6: Polish

- [x] T010 CSS 與 RWD 檢查（375／768／1280）
- [x] T011 更新截圖腳本並重拍；更新 README、index.html 說明與 llms.txt
- [x] T012 npm test 與 npm run build
