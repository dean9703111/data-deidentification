# Implementation Plan: 部分保留去識別化與跨檔案共用編碼

**Branch**: `002-partial-retention-shared-codes` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

## Summary

在既有「整筆替換為 `[類別:編碼]`」的流程上，讓每條規則可設定保留方式。做法是讓去識別化項目仍涵蓋完整原值，另外記錄保留的前、後字元數（`head`／`tail`）。輸出時組成「前綴＋標記＋後綴」，編碼表的 `original` 只寫被隱藏片段，所以還原程式完全不用改。跨檔案共用編碼的做法，是讓多個文件共用同一個 `CodeBook`，匯入編碼表則是用既有的列預先填入 `CodeBook`。

## Technical Context

- **Language/Version**: TypeScript 5（Vite，純前端）
- **Primary Dependencies**: 沿用既有依賴，不新增任何依賴
- **Storage**: 保留設定存入現有的 `deid.patternConfig.v1`（localStorage）並新增選填欄位 `retention`；匯入的編碼表只放在記憶體
- **Testing**: Vitest（unit＋round-trip integration）
- **Constraints**: 資料不出瀏覽器；CSV 契約只允許在尾端新增欄位

## Constitution Check

| 原則 | 結果 |
|---|---|
| I 純前端 | ✅ 沒有網路傳輸；匯入的編碼表只存在記憶體 |
| II 可逆 | ✅ 保留字元留在文件內，`original` 為被隱藏片段；編碼 key 納入切分，一個編碼只對應一個片段；新增 round-trip 測試 |
| III 人工覆核 | ✅ 預覽與 tooltip 反映實際輸出；手動新增可逐筆選擇保留方式 |
| IV 規則透明 | ✅ 保留設定顯示在規則表中，建議值需使用者手動套用 |
| V 簡單 | ✅ 新增一個核心模組 `retention.ts`，其餘都是小幅擴充 |

## Design

### 核心（`src/core`）

- `retention.ts`（新）：
  - `Retention` 型別，六種模式：`none`、`ends`、`delim`、`surname`、`city`、`district`。
  - `splitFor(original, r)`：回傳 `{head, tail}`；無法隱藏至少 1 個字元時回傳 `{0, 0}`（FR-010）。
  - `checkRetention(example, r)`：回傳錯誤或警告（FR-013 到 FR-015）。
  - `describeRetention(r)`：產生顯示用的文字。
  - `SUGGESTED_RETENTION`：內建規則的建議值（FR-004）。
- `types.ts`：
  - `RedactionItem` 新增選填欄位 `head` 與 `tail`。
  - `MappingEntry` 新增選填欄位 `prefix` 與 `suffix`。
  - `Pattern` 與 `PatternConfig` 新增選填欄位 `retention`。
- `codes.ts`：
  - `codeFor(category, original, head, tail)` 的 key 納入切分（FR-009）。
  - 新增 `seed(entries)`，用匯入的編碼表預先填入：編碼列為已使用，以 key 反查；同一 key 出現重複時回傳警告（FR-023 到 FR-027）。
- `detector.ts`：`detect` 依命中的規則套用保留設定；`addManualItem` 新增參數 `retention`。
- `redactor.ts`：
  - `outputFor(item)` 組出「前綴＋標記＋後綴」。
  - 編碼表寫入被隱藏片段與前、後綴。
  - 新增 `mergeMappings`，產生合併編碼表。
- `csv.ts`：只有當某列含前、後綴時，才輸出 `kept_prefix` 與 `kept_suffix` 欄位，讓預設行為維持位元組相同（FR-030）；解析時選擇性讀取這兩欄。
- `mask.ts`：新增 `maskItem(item)`，有切分時顯示「前綴＋`*`＋後綴」，沒有切分時沿用 `maskDisplay`。
- `pattern-store.ts`：讀寫 `retention`，並將其附加到 `getEffectivePatterns` 的結果上。

### 格式（`src/formats/batch.ts`）

- `buildArchive` 可選擇附上合併編碼表。
- 若有任一檔案含部分保留，清單加上「部分保留」欄（FR-016、FR-021）。

### UI

- `patterns-view.ts`：規則表新增「保留」欄；點擊後展開編輯列，可選模式與參數、以範例即時預覽、套用建議，儲存前執行檢查（錯誤時擋下；有警告時彈出確認）。
- `process-view.ts`：
  - 上傳畫面新增「整批共用編碼」勾選，以及匯入編碼表並附上說明（FR-019、FR-022、FR-028）。
  - 工具列顯示目前模式、「下載合併編碼表」按鈕，以及部分保留提示。
  - 預覽、tooltip、偵測清單改用 `maskItem` 與 `outputFor` 顯示。
  - 手動新增視窗加入保留方式選擇（FR-012）。

## Contracts

請見 [contracts/mapping-csv-v2.md](contracts/mapping-csv-v2.md)。
