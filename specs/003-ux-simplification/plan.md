# Implementation Plan: 去識別化流程的 UI／UX 簡化

**Branch**: `003-ux-simplification` | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)

## Summary

這次幾乎只改 UI，核心邏輯只做小幅調整：
- 預覽標籤改用 `previewLabel(item)`：保留前綴＋`[類別]`＋保留後綴。
- 新增 `setCategoryRetention`，把各類別的保留設定寫回規則設定，供「設為預設」使用。
- 移除 `SUGGESTED_RETENTION`（UI 已不再使用）。

其餘改動都在 `process-view.ts`、`patterns-view.ts` 與 CSS。

## Technical Context

- 沿用 TypeScript、Vite、Vitest，不新增任何依賴。

## Constitution Check

| 原則 | 結果 |
|---|---|
| I 純前端 | ✅ 沒有變更 |
| II 可逆 | ✅ 合併下載確保文件與編碼表成對；以版本追蹤提示不一致 |
| III 人工覆核 | ✅ 預覽改為反映實際輸出，覆核更可靠；類別開關保留 |
| IV 規則透明 | ✅ 規則頁仍顯示每條規則的保留設定（唯讀） |
| V 簡單 | ✅ 設定入口從三處減為一處，工具列按鈕減少 |

## Design

- **DocState**：
  - 新增 `version`，由 `markDirty` 遞增。
  - 新增 `docVer` 與 `csvVer`，記錄文件與編碼表各自下載時的版本；兩份檔案都已下載且版本等於 `version`，才算已完成。
- **下載**：
  - 單檔時，主要按鈕 `downloadBoth`：先產生並下載文件，再下載 CSV。
  - 多檔時，主要按鈕為打包下載。
  - 「更多」選單用 `<details class="menu">` 實作。
- **輸出方式面板**：
  - 用 `<details>` 實作，是否展開記錄在 `state.panelOpen`。
  - 摘要列顯示模式名稱與生效筆數。
  - 內容：模式 radio（附範例）、類別表（勾選、類別、筆數、保留控制、範例、行內訊息）、「設為預設」（自訂模式時）、編碼範圍（整批共用勾選、匯入與移除編碼表）。
  - 移除圖例列；「純文字檢視」移到預覽標題列。
- **編碼範圍切換**：`rebuildBooks()` 清除 `sharedBook`，每份文件重新建立 book（依共用與匯入設定），再重新配置編碼並標記 dirty。
- **狀態列**：一行 `.status-line`；格式限制用 `data-tip` 的 ⓘ 呈現；部分保留提示維持 notice 樣式。
- **規則頁**：「保留」欄改為唯讀文字，移除編輯器與 `confirm`，加上一行說明。
- **手動新增**：移除保留選單，改用 `effectiveRetention`。

## Testing

- 單元測試：`previewLabel`、`setCategoryRetention`。
- 原有的 round-trip 測試不變，必須全部通過。
- 在 375、768、1280 三種寬度做 RWD 檢查；重拍截圖並更新 README、`index.html` 的說明與 `llms.txt`。
