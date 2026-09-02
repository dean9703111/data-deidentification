# Contract: 規則設定持久化 Schema（localStorage）

規則設定是唯一允許持久化的資料（constitution Security Requirements、FR-012）。文件內容與對照表**不得**寫入任何瀏覽器儲存。

## Key

`deid.patternConfig.v1`

## Value（JSON）

```json
{
  "version": 1,
  "disabledBuiltins": ["tw-landline"],
  "customPatterns": [
    {
      "id": "c-8f3a1b",
      "name": "員工編號",
      "category": "識別碼",
      "regex": "EMP-\\d{6}",
      "example": "EMP-004521",
      "enabled": true
    }
  ]
}
```

| 欄位 | 說明 |
|------|------|
| version | schema 版本；讀到未知版本或解析失敗 → 靜默重置為預設（全部內建啟用、無自訂） |
| disabledBuiltins | 被停用的內建規則 id 清單（內建規則本體不落地，隨程式版本更新） |
| customPatterns[] | 自訂規則；`regex` 儲存前必須通過 `new RegExp(regex, 'gu')` 驗證（FR-011） |

## 內建規則 id（固定，不可改名）

`zh-name`（姓名）、`tw-id`（身分證）、`tw-mobile`（手機）、`tw-landline`（市話）、`tw-address`（地址）、`tw-company`（公司）、`tw-tax-id`（統編）、`email`（電子郵件）
