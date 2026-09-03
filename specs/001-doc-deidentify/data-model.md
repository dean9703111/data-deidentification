# Data Model: 文件去識別化工具

**Date**: 2026-09-02 | **Plan**: [plan.md](plan.md)

所有實體僅存在於瀏覽器記憶體（例外：`PatternConfig` 持久化於 localStorage）。

## LoadedDocument（文件）

| 欄位 | 型別 | 說明 |
|------|------|------|
| fileName | string | 原始檔名 |
| format | `'txt' \| 'md' \| 'docx' \| 'pdf'` | 由副檔名＋內容驗證判定 |
| text | string | 擷取後全文（偵測與預覽的基準座標系） |
| handle | 格式專屬 | 產出時所需的來源資料（docx: 原 ZIP＋節點對照；pdf: 每頁文字項目與座標；txt/md: 無） |

**驗證**: 大小 ≤ 20 MB（FR-002）；PDF 擷取後 `text` 為空 → 判定無文字層並拒絕（FR-004）。

## Pattern（偵測規則）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | string | 內建為固定 slug（如 `tw-id`）、自訂為隨機 id |
| name | string | 顯示名稱 |
| category | Category | 見下方 Category |
| source | `'builtin' \| 'custom'` | 內建規則不可編輯/刪除，只可停用 |
| regex | string | 比對規則（自訂規則由使用者輸入；儲存前以 `new RegExp(p, 'gu')` 驗證） |
| validate? | function | 僅內建規則可有（如身分證檢核碼）；命中後二次過濾 |
| example | string | 規則管理頁顯示的範例 |
| enabled | boolean | 啟用狀態 |

**Category**: `'姓名' | '身分證' | '手機' | '市話' | '地址' | '電子郵件' | '識別碼'`（自訂規則固定為 `識別碼`，或允許使用者選擇類別）

## RedactionItem（去識別化項目）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | string | 內部識別 |
| category | Category | |
| original | string | 原始文字 |
| start / end | number | 在 `LoadedDocument.text` 中的位移（半開區間） |
| code | string | 6 字元 hex 編碼，單次工作階段內唯一 |
| origin | `'auto' \| 'manual'` | 自動偵測或手動圈選 |
| active | boolean | false = 已被使用者取消（FR-014） |

**不變條件**:
- 生效（active）項目的 `[start, end)` 彼此不重疊（FR-008：偵測時長者優先；手動圈選與既有項目重疊時拒絕並提示）。
- 同一份文件內，`category` 與 `original` 皆相同的 RedactionItem 共用同一個 `code`，不同組合的 `code` 不重複（FR-018）；同一原始值多次出現 → 各自的 RedactionItem、同一個 code；CSV 每個 code 只列一列。

**狀態轉移**: `active=true` ⇄ `active=false`（取消/加回，FR-014）；下載時僅 `active=true` 者進入輸出與 CSV。

## MappingEntry（編碼對照表列）

| 欄位 | 型別 | 說明 |
|------|------|------|
| code | string | 編碼（CSV 主鍵，不可重複；FR-025） |
| category | Category | |
| original | string | 原始值（可含逗號/引號/換行 → CSV 需引號跳脫） |

與去識別化文件成對產生；還原時以 `code` 查表。文件中存在但 CSV 查無的 code → 收集為警告清單（FR-024）。

## 關係總覽

```text
Pattern (enabled) ──偵測──▶ RedactionItem[] ──(active)──▶ 去識別化文字 + MappingEntry[]
                                   ▲                              │
                            手動圈選新增 (US2)                CSV 下載/上傳
                                                                  │
去識別化文件 + MappingEntry[] ──還原──▶ 原始文字（round-trip，SC-003）
```
