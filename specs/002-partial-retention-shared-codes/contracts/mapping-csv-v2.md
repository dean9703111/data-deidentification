# Contract 增補：編碼表 CSV 保留欄位

延伸 `specs/001-doc-deidentify/contracts/mapping-csv.md`，屬非破壞性變更：只在欄位尾端新增。

```csv
code,category,original,kept_prefix,kept_suffix
a3f9c2,身分證,23456789,A1,
7b21e8,手機,0912-345-,,678
5d0e17,姓名,小明,王,
```

- `original` 是被隱藏的片段；完整原值為 `kept_prefix + original + kept_suffix`。
- 只有至少一列有保留字元時才輸出這兩欄；全部隱藏時的輸出與 v1 完全相同。
- 還原時只使用 `code` 與 `original`，保留欄位只在「匯入以沿用編碼」時用到；沒有這兩欄時，視為前、後綴皆為空。
- 合併編碼表的格式相同，每個編碼一列，可能包含文件中沒有用到的編碼，還原時不視為錯誤。
