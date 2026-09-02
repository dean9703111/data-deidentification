# Implementation Plan: 文件去識別化工具

**Branch**: `001-doc-deidentify` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-doc-deidentify/spec.md`

## Summary

純前端單頁應用：使用者上傳 PDF/Word(.docx)/Excel(.xlsx)/TXT/Markdown，系統以 regex 規則引擎偵測中文姓名、身分證字號、手機、市話、地址、Email 與自訂識別碼，在頁面預覽（類別+短編碼標記、可取消/手動新增），下載「盡量保留原格式」的去識別化文件與 CSV 編碼對照表；之後可上傳去識別化文件＋CSV 還原。技術方案：TypeScript + Vite（vanilla DOM）、pdfjs-dist 解析 PDF、pdf-lib 重建文字版面 PDF（避免覆蓋法的隱藏文字洩漏）、jszip + DOMParser 對 .docx 做文字節點級取代（格式 100% 保留）、Vitest 測試。全部處理在瀏覽器內，零網路傳輸。

## Technical Context

**Language/Version**: TypeScript 5.x（ES2022 target），瀏覽器執行

**Primary Dependencies**: Vite 6（建置）、pdfjs-dist（PDF 文字＋座標擷取）、pdf-lib + @pdf-lib/fontkit（PDF 輸出、CJK 字型內嵌）、jszip（.docx ZIP 處理）、Noto Sans TC 字型資產；其餘（CSV、規則引擎、UI）自寫

**Storage**: localStorage 僅存偵測規則設定；文件內容與對照表僅存在記憶體（constitution 限制）

**Testing**: Vitest（unit + integration round-trip）；測試撰寫/驗證由 Sonnet 子代理執行

**Target Platform**: 近兩年桌面瀏覽器（Chrome/Edge/Safari/Firefox），純靜態站台（`vite build` 產出 `dist/`）

**Project Type**: 純前端單頁 Web 應用（無後端）

**Performance Goals**: 10 頁文件上傳→預覽 < 5 秒（SC-001）；取消/新增後預覽更新 < 1 秒（SC-007）

**Constraints**: 檔案上限 20 MB；離線可用（除首次載入資產）；文件內容零網路請求（SC-005）；輸出 PDF 內不得殘留原始敏感文字

**Scale/Scope**: 單檔處理、3 個主要畫面（處理/規則管理/還原）、6 類內建規則＋自訂規則、5 個核心模組（formats、detector、codes、csv、ui）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查 | 結果 |
|------|------|------|
| I. Client-Side Only | 無後端、無 API 呼叫；所有依賴打包為靜態資產；`vite build` 產出可任意靜態部署 | ✅ PASS |
| II. Reversibility | 去識別化與還原共用同一套格式管線（R8）；標記 `[類別:編碼]` 內嵌於文件、CSV 為唯一還原憑證；round-trip 有整合測試把關 | ✅ PASS |
| III. Human in the Loop | 預覽＋逐筆取消/圈選新增為 P1/P2 核心 UI；下載按鈕僅存在於預覽畫面 | ✅ PASS |
| IV. Transparent Patterns | 規則管理頁列出全部規則（含內建）之名稱/類別/regex/範例/啟用狀態；無隱藏規則 | ✅ PASS |
| V. Simplicity | 無 UI 框架；僅 3 個執行期依賴（pdfjs-dist、pdf-lib+fontkit、jszip），各自對應一項瀏覽器無內建能力；CSV/規則引擎自寫 | ✅ PASS |
| Security Requirements | localStorage 僅存規則設定；隨機編碼不可反推（R6）；PDF 採重建法杜絕隱藏文字殘留（R2）；beforeunload 提醒 | ✅ PASS |

**Post-Phase-1 re-check（2026-09-02）**: 設計文件（data-model、contracts）未引入新依賴或後端需求；PASS 維持。

## Project Structure

### Documentation (this feature)

```text
specs/001-doc-deidentify/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── mapping-csv.md   # CSV 編碼對照表格式契約
│   ├── marker-format.md # 文件內編碼標記格式契約
│   └── pattern-schema.md# 規則設定（localStorage）schema 契約
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
index.html               # 單頁入口（三個頁籤：處理、偵測規則、還原）
public/
└── fonts/NotoSansTC-Regular.otf   # PDF 輸出用 CJK 字型
src/
├── main.ts              # 進入點、頁籤路由、beforeunload 保護
├── styles.css
├── core/
│   ├── types.ts         # Document/Pattern/RedactionItem/MappingEntry 型別
│   ├── patterns.ts      # 內建規則定義（regex+驗證函式+範例）
│   ├── pattern-store.ts # 規則啟用狀態與自訂規則的 localStorage 存取
│   ├── detector.ts      # 全文偵測、重疊裁決（長者優先）
│   ├── codes.ts         # 隨機短編碼產生（唯一性保證）、標記組裝/解析
│   ├── redactor.ts      # 由生效項目產生去識別化文字與對照表
│   ├── restorer.ts      # 標記掃描、CSV 對照還原、未對應編碼收集
│   ├── csv.ts           # RFC 4180 writer/parser（UTF-8 BOM）
│   └── twid.ts          # 台灣身分證檢核碼驗證
├── formats/
│   ├── index.ts         # 格式偵測與統一介面（parse/generate）
│   ├── plaintext.ts     # TXT/Markdown
│   ├── docx.ts          # jszip + DOMParser 文字節點管線（含 header/footer）
│   ├── xlsx.ts          # jszip + DOMParser 儲存格管線（inline string 改寫、共用字串清除）
│   └── pdf.ts           # pdfjs 擷取（含座標）＋ pdf-lib 文字版面重建
└── ui/
    ├── process-view.ts  # 上傳、預覽（高亮標記）、項目清單、取消/圈選新增、下載
    ├── patterns-view.ts # 規則清單、啟用開關、自訂規則 CRUD、測試字串預覽
    ├── restore-view.ts  # 還原模式：雙檔上傳、警告清單、還原下載
    └── components.ts    # 共用 DOM helpers、檔案上傳/下載工具
tests/
├── unit/
│   ├── patterns.test.ts # 各內建規則命中/不命中樣本
│   ├── twid.test.ts
│   ├── detector.test.ts # 重疊裁決
│   ├── codes.test.ts    # 唯一性、標記解析
│   └── csv.test.ts      # writer/parser round-trip、特殊字元
└── integration/
    ├── roundtrip-text.test.ts # TXT/MD 去識別化→還原逐字元一致
    ├── roundtrip-docx.test.ts # .docx round-trip、格式保留、跨 run 取代
    ├── roundtrip-xlsx.test.ts # .xlsx round-trip、樣式保留、壓縮檔內零殘留
    └── restore-errors.test.ts # CSV 缺編碼/格式錯誤情境
```

**Structure Decision**: 單一 Vite 專案於 repo 根目錄。`core/`（純邏輯、可測）與 `formats/`（檔案格式 I/O）、`ui/`（DOM）分層；所有測試針對 core 與 formats，UI 層薄化。

## Complexity Tracking

無 constitution 違規，無需填寫。三個執行期依賴各自對應瀏覽器缺乏的能力（PDF 解析、PDF 產生、ZIP），已於 Constitution Check 原則 V 說明。
