# Data De-identification Tool Constitution

## Core Principles

### I. Client-Side Only（純前端、零資料外傳）(NON-NEGOTIABLE)
所有文件解析、去識別化、還原處理必須完全在使用者瀏覽器內完成。文件內容、敏感值、編碼對照表在任何情況下不得透過網路傳送到任何伺服器或第三方服務。應用程式必須可以純靜態檔案形式部署（任何靜態網頁空間或本機開啟皆可運作），不得依賴後端 API。

### II. Reversibility & Round-Trip Fidelity（可逆與無損還原）
每一筆被去識別化的內容必須可透過編碼對照表精確還原。「去識別化 → 下載 → 上傳 + 編碼表 → 還原」的完整循環結果，其文字內容必須與原始文件一致。編碼在單次輸出內不得重複；還原不得依賴使用者無法保存的瀏覽器內部狀態——編碼表（CSV）是唯一還原憑證。

### III. Human in the Loop（使用者最終決定權）
自動偵測結果一律視為「建議」。在輸出前，使用者必須能夠檢視每一筆偵測結果、取消任一筆誤判（false positive）、以及手動圈選新增遺漏項目（false negative）。系統不得在未經使用者確認預覽的情況下直接產出去識別化檔案。

### IV. Transparent & Editable Patterns（規則透明可管理）
所有用於偵測敏感資訊的 pattern 必須在介面上可檢視，包含名稱、類別與比對規則。使用者可啟用/停用個別 pattern。不得存在使用者看不到的隱藏偵測規則。

### V. Simplicity & Static Deployability（簡單優先）
優先採用最簡單可行的技術方案；避免不必要的框架與建置複雜度。任何新增依賴必須有明確理由。最終產物必須是可直接以靜態檔案伺服的網站。

## Security & Privacy Requirements

- 敏感資料（原文、對照表）僅存在於記憶體與使用者主動下載的檔案中；若使用瀏覽器儲存（localStorage 等），僅得存放 pattern 設定，不得存放文件內容或對照表。
- 編碼必須不可由編碼本身反推原始值（不得使用可逆編碼如 Base64 直接編碼原文）。
- 離開或重新整理頁面前，若有未下載的處理結果，應提醒使用者資料將遺失。

## Development Workflow

- 依循 spec-kit 流程：constitution → specify → plan → tasks → implement。
- 偵測 pattern（正規表達式等）必須有對應的測試案例，涵蓋命中與不應命中（誤判）兩類樣本。
- 去識別化/還原的 round-trip 必須有自動化測試驗證。

## Governance

本 constitution 優先於其他開發慣例。修改本文件須更新版本號並記錄修改原因。所有 plan 與 implementation 必須通過上述原則的合規檢查；任何與原則衝突的設計必須在 plan 的 Complexity Tracking 中說明理由或修正。

**Version**: 1.0.0 | **Ratified**: 2026-09-02 | **Last Amended**: 2026-09-02
