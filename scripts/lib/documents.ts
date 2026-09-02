// Realistic example documents (all data fictional): a 4-page service contract,
// a 4-page quotation, a 60-row customer workbook, and a few text files.
import type { DocModel } from './docmodel.ts';
import { Fake } from './fake.ts';
import type { CellSpec, XlsxSpec } from '../../tests/helpers/xlsx-builder.ts';

export interface Party {
  company: string;
  taxId: string;
  address: string;
  rep: string;
  contact: string;
  phone: string;
  mobile: string;
  email: string;
}

function party(f: Fake): Party {
  const contact = f.name();
  return {
    company: f.company(),
    taxId: f.taxId(),
    address: f.address(),
    rep: f.name(),
    contact,
    phone: f.landline(),
    mobile: f.mobile(),
    email: f.email(contact),
  };
}

const money = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`;

// ---------------------------------------------------------------------------------------
// 服務契約書（4 頁）
// ---------------------------------------------------------------------------------------
export function contract(seed = 101): DocModel {
  const f = new Fake(seed);
  const a = party(f);
  const bName = f.name();
  const b = { name: bName, id: f.twId(), address: f.address(), mobile: f.mobile(), email: f.email(bName), bank: f.bankAccount() };
  const witness = f.name();
  const start = '2026-10-01';
  const end = '2027-09-30';
  const fee = 85000;
  const contactRows: string[][] = [
    ['甲方－專案窗口', a.contact, a.phone, a.mobile, a.email],
    ['甲方－財務窗口', f.name(), f.landline(), f.mobile(), f.email()],
    ['甲方－資訊窗口', f.name(), f.landline(), f.mobile(), f.email()],
    ['乙方', b.name, '—', b.mobile, b.email],
    ['乙方－緊急聯絡人', f.name(), '—', f.mobile(), '—'],
  ];

  return {
    title: '委外服務契約書',
    header: `${a.company}　委外服務契約書　契約編號 SC-2026-0917`,
    footer: '機密文件　未經雙方書面同意不得揭露',
    blocks: [
      { type: 'title', text: '委外服務契約書' },
      { type: 'subtitle', text: '契約編號：SC-2026-0917　　簽約日期：2026 年 9 月 17 日' },
      { type: 'heading', text: '立契約書人' },
      {
        type: 'kv',
        rows: [
          ['甲方', `${a.company}（統一編號 ${a.taxId}）`],
          ['代表人', a.rep],
          ['地址', a.address],
          ['聯絡人', `${a.contact}　電話 ${a.phone}　手機 ${a.mobile}　電子郵件 ${a.email}`],
          ['乙方', `${b.name}（身分證字號 ${b.id}）`],
          ['戶籍地址', b.address],
          ['聯絡方式', `手機 ${b.mobile}　電子郵件 ${b.email}`],
        ],
      },
      { type: 'para', text: `甲乙雙方同意就甲方委託乙方提供資訊系統維運與顧問服務事宜，訂立本契約，並同意遵守下列條款：`, indent: true },
      { type: 'heading', text: '第一條　服務內容' },
      { type: 'para', text: '乙方應依附件一「服務項目表」所列項目提供服務，包括但不限於系統監控、例行維護、事件處理、效能調校及相關技術諮詢。服務範圍之變更應由雙方以書面另行議定。', indent: true },
      { type: 'heading', text: '第二條　契約期間' },
      { type: 'para', text: `本契約有效期間自 ${start} 起至 ${end} 止，共計十二個月。期滿前六十日內，任一方未以書面表示終止者，本契約自動延展一年，以後亦同。`, indent: true },
      { type: 'heading', text: '第三條　服務報酬與付款方式' },
      { type: 'para', text: `甲方應按月給付乙方服務報酬 ${money(fee)}（含稅）。乙方應於每月五日前開立當月請款單交付甲方聯絡人 ${a.contact}（${a.email}），甲方於收到請款單後三十日內以匯款方式支付至乙方指定帳戶：${f.pick(['第一銀行', '台北富邦', '國泰世華', '中國信託'])}　帳號 ${b.bank}　戶名 ${b.name}。`, indent: true },
      { type: 'para', text: '匯款手續費由甲方負擔。乙方應依法開立收據或發票。', indent: true },
      { type: 'heading', text: '第四條　服務水準' },
      { type: 'para', text: '乙方應於甲方通報重大事件後二小時內回應，並於八小時內提出處置方案；一般事件應於一個工作日內回應。乙方每月應提供服務報告予甲方資訊窗口。', indent: true },
      { type: 'pageBreak' },
      { type: 'heading', text: '第五條　保密義務' },
      { type: 'para', text: `乙方因履行本契約而知悉或持有甲方之營業秘密、客戶資料（含客戶姓名、身分證字號、聯絡電話、地址等個人資料）及其他機密資訊，應負保密義務，非經甲方書面同意不得洩漏、交付或使第三人知悉。本條義務於契約終止後五年內仍持續有效。`, indent: true },
      { type: 'heading', text: '第六條　個人資料保護' },
      { type: 'para', text: '乙方處理甲方提供之個人資料，應遵守個人資料保護法及相關法令，僅得於履行本契約之必要範圍內蒐集、處理及利用，並採取適當之安全維護措施。乙方於契約終止時應將所有個人資料交還甲方或依甲方指示銷毀，並出具切結書。', indent: true },
      { type: 'heading', text: '第七條　智慧財產權' },
      { type: 'para', text: '乙方於履約期間所完成之工作成果（含文件、程式碼、設計圖說等），其著作財產權自完成時起歸甲方所有。乙方保證工作成果無侵害第三人智慧財產權之情事。', indent: true },
      { type: 'heading', text: '第八條　違約責任' },
      { type: 'para', text: `任一方違反本契約約定，經他方以書面催告限期改正而逾期未改正者，他方得終止本契約並請求損害賠償。乙方違反第五條或第六條者，應給付甲方懲罰性違約金 ${money(500000)}，甲方受有損害超過該金額者並得請求賠償。`, indent: true },
      { type: 'heading', text: '第九條　契約終止' },
      { type: 'para', text: '任一方得於三十日前以書面通知他方終止本契約。契約終止時，乙方應於七日內完成交接，甲方應就已提供之服務按比例給付報酬。', indent: true },
      { type: 'heading', text: '第十條　通知' },
      { type: 'para', text: `本契約之通知應以書面為之，送達地址以本契約首頁所載為準；以電子郵件送達者，甲方送達 ${a.email}，乙方送達 ${b.email}。地址或電子郵件變更時應即通知他方，否則以原地址送達視為已合法送達。`, indent: true },
      { type: 'heading', text: '第十一條　準據法與管轄' },
      { type: 'para', text: '本契約以中華民國法律為準據法。因本契約所生之爭議，雙方同意以臺灣臺北地方法院為第一審管轄法院。', indent: true },
      { type: 'heading', text: '第十二條　其他' },
      { type: 'para', text: '本契約未盡事宜，依相關法令及誠信原則處理。本契約一式二份，由甲乙雙方各執一份為憑。附件為本契約之一部分，與本契約具同等效力。', indent: true },
      { type: 'pageBreak' },
      { type: 'heading', text: '附件一　服務項目表' },
      {
        type: 'table',
        columns: [{ header: '項次', width: 1 }, { header: '服務項目', width: 3 }, { header: '內容說明', width: 6 }, { header: '頻率', width: 2 }],
        rows: [
          ['1', '系統監控', '主機、資料庫與應用服務之可用性及效能監控，異常即時通報甲方資訊窗口', '每日'],
          ['2', '例行維護', '安全性更新、備份驗證、日誌清理與容量檢視', '每週'],
          ['3', '事件處理', '故障排除、根因分析與事件報告', '依需求'],
          ['4', '效能調校', '資料庫索引、查詢與快取策略調整', '每季'],
          ['5', '技術諮詢', '架構、資安與新技術導入之諮詢', '每月 8 小時'],
          ['6', '服務報告', '月報含事件統計、SLA 達成率與改善建議', '每月'],
        ],
      },
      { type: 'heading', text: '附件二　聯絡窗口' },
      {
        type: 'table',
        columns: [{ header: '角色', width: 3 }, { header: '姓名', width: 2 }, { header: '電話', width: 3 }, { header: '手機', width: 3 }, { header: '電子郵件', width: 4 }],
        rows: contactRows,
      },
      { type: 'para', text: '聯絡窗口異動時，應於三個工作日內以電子郵件通知他方。' },
      { type: 'pageBreak' },
      { type: 'heading', text: '簽署' },
      { type: 'para', text: '雙方確認已充分閱讀並理解本契約全部條款，同意簽署如下：' },
      { type: 'spacer' },
      { type: 'kv', rows: [['甲方', a.company], ['統一編號', a.taxId], ['代表人', `${a.rep}　　　　　　　　　　（簽章）`], ['地址', a.address], ['電話', a.phone]] },
      { type: 'spacer' },
      { type: 'kv', rows: [['乙方', `${b.name}　　　　　　　　　　（簽章）`], ['身分證字號', b.id], ['地址', b.address], ['手機', b.mobile]] },
      { type: 'spacer' },
      { type: 'kv', rows: [['見證人', `${witness}　　　　　　　　　　（簽章）`], ['身分證字號', f.twId()], ['聯絡電話', f.mobile()]] },
      { type: 'spacer' },
      { type: 'para', text: '中華民國　一一五　年　九　月　十七　日', align: 'center' },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// 報價單（4 頁）
// ---------------------------------------------------------------------------------------
export function quotation(seed = 202): DocModel {
  const f = new Fake(seed);
  const vendor = party(f);
  const client = party(f);
  const items: [string, string, number, number][] = [
    ['應用伺服器', 'Dell PowerEdge R760，2×Xeon Gold 6430，256GB RAM', 2, 486000],
    ['儲存陣列', 'NetApp AFF A250，24×3.84TB NVMe', 1, 1980000],
    ['核心交換器', 'Cisco Catalyst 9300 48P，含 10G 上聯模組', 2, 268000],
    ['防火牆', 'FortiGate 200F，含 3 年 UTP 授權', 1, 412000],
    ['UPS 不斷電系統', 'APC Smart-UPS SRT 10kVA', 1, 218000],
    ['機櫃', '42U 標準機櫃含 PDU', 2, 36000],
    ['虛擬化平台授權', 'VMware vSphere Standard，8 CPU', 1, 356000],
    ['備份軟體', 'Veeam Backup & Replication Enterprise，10 instance', 1, 186000],
    ['作業系統授權', 'Windows Server 2022 Datacenter，16 core', 2, 198000],
    ['資料庫授權', 'Microsoft SQL Server 2022 Standard，2 core pack', 4, 128000],
    ['監控系統', 'Zabbix 建置與客製儀表板', 1, 96000],
    ['建置服務', '硬體上架、佈線、虛擬化平台建置與移轉', 1, 320000],
    ['資安健檢', '弱點掃描與滲透測試（一次）', 1, 150000],
    ['教育訓練', '維運人員訓練 2 天（每場至多 12 人）', 2, 45000],
    ['維護保固', '硬體 3 年次日到場、軟體 1 年更新', 1, 468000],
    ['備援線路', 'MPLS VPN 100M，年費', 1, 240000],
    ['機房環控', '溫濕度與漏水感測器含告警', 1, 58000],
    ['線材與耗材', 'Cat6A 跳線、光纖跳線與標籤', 1, 22000],
    ['專案管理', '專案經理駐點 3 個月', 1, 270000],
    ['文件與移交', '架構文件、SOP 與驗收報告', 1, 40000],
  ];
  const rows = items.map(([name, spec, qty, price], i) => [String(i + 1), name, spec, String(qty), money(price), money(qty * price)]);
  const subtotal = items.reduce((s, [, , q, p]) => s + q * p, 0);
  const tax = Math.round(subtotal * 0.05);
  const sales = { name: vendor.contact, mobile: vendor.mobile, email: vendor.email };
  const support = { name: f.name(), phone: f.landline(), mobile: f.mobile() };
  const supportEmail = f.email(support.name);

  return {
    title: '報價單',
    header: `${vendor.company}　報價單 Q-2026-0912`,
    footer: `${vendor.company}　${vendor.phone}`,
    blocks: [
      { type: 'title', text: '報　價　單' },
      { type: 'subtitle', text: '報價單號：Q-2026-0912　　報價日期：2026-09-12　　有效期限：2026-10-12' },
      { type: 'heading', text: '客戶資料' },
      {
        type: 'kv',
        rows: [
          ['客戶名稱', `${client.company}（統一編號 ${client.taxId}）`],
          ['聯絡人', `${client.contact}　${f.pick(['資訊部經理', '採購課長', '總務主任', '營運處長'])}`],
          ['電話', `${client.phone}　　手機 ${client.mobile}`],
          ['電子郵件', client.email],
          ['送貨地址', client.address],
          ['發票地址', f.address()],
        ],
      },
      { type: 'heading', text: '報價明細' },
      {
        type: 'table',
        columns: [{ header: '項次', width: 1 }, { header: '品項', width: 3 }, { header: '規格', width: 6 }, { header: '數量', width: 1.2 }, { header: '單價', width: 2.4 }, { header: '小計', width: 2.6 }],
        rows: rows.slice(0, 10),
      },
      { type: 'para', text: '（明細續下頁）', align: 'right' },
      { type: 'pageBreak' },
      { type: 'heading', text: '報價明細（續）' },
      {
        type: 'table',
        columns: [{ header: '項次', width: 1 }, { header: '品項', width: 3 }, { header: '規格', width: 6 }, { header: '數量', width: 1.2 }, { header: '單價', width: 2.4 }, { header: '小計', width: 2.6 }],
        rows: rows.slice(10),
      },
      { type: 'kv', rows: [['未稅合計', money(subtotal)], ['營業稅 5%', money(tax)], ['含稅總計', money(subtotal + tax)]] },
      { type: 'para', text: '以上金額以新台幣計價。本報價含運送至送貨地址之運費，不含進口關稅及其他規費。', indent: true },
      { type: 'pageBreak' },
      { type: 'heading', text: '交貨與驗收' },
      { type: 'para', text: `硬體設備於收到訂單後 45 個日曆天內交付至 ${client.address}；軟體授權於收到訂單後 7 個工作天內以電子方式交付。到貨後由客戶聯絡人 ${client.contact} 會同本公司人員進行驗收，驗收期間為 10 個工作天。`, indent: true },
      { type: 'heading', text: '付款條件' },
      { type: 'para', text: `訂單簽回時支付 30% 訂金，設備到貨驗收合格後支付 60%，保固期滿 30 日內支付尾款 10%。請匯款至：${f.pick(['台灣銀行', '兆豐銀行', '玉山銀行'])}　帳號 ${f.bankAccount()}　戶名 ${vendor.company}。`, indent: true },
      { type: 'heading', text: '保固與維護' },
      { type: 'para', text: '硬體設備提供 3 年原廠保固及次日到場服務；軟體提供 1 年版本更新與技術支援。保固期間內非人為因素之故障由本公司負責維修或更換。', indent: true },
      { type: 'heading', text: '聯絡窗口' },
      {
        type: 'table',
        columns: [{ header: '角色', width: 2 }, { header: '姓名', width: 2 }, { header: '電話', width: 3 }, { header: '手機', width: 3 }, { header: '電子郵件', width: 4 }],
        rows: [
          ['業務代表', sales.name, vendor.phone, sales.mobile, sales.email],
          ['技術支援', support.name, support.phone, support.mobile, supportEmail],
          ['客服中心', '—', '0800-000-123', '—', 'service@example.com.tw'],
        ],
      },
      { type: 'para', text: `本報價單有任何疑問，請洽業務代表 ${sales.name}（${sales.mobile}）。` },
      { type: 'pageBreak' },
      { type: 'heading', text: '客戶確認簽回' },
      { type: 'para', text: '本公司同意依上述報價內容與條件採購，請於簽章後回傳。' },
      { type: 'spacer' },
      { type: 'kv', rows: [['公司名稱', client.company], ['統一編號', client.taxId], ['負責人', `${client.rep}　　　　　　　　　　（簽章）`], ['採購聯絡人', `${client.contact}　${client.mobile}`], ['地址', client.address]] },
      { type: 'spacer' },
      { type: 'kv', rows: [['報價廠商', vendor.company], ['統一編號', vendor.taxId], ['負責人', `${vendor.rep}　　　　　　　　　　（簽章）`], ['地址', vendor.address], ['電話', vendor.phone]] },
      { type: 'spacer' },
      { type: 'para', text: '簽回日期：　　　年　　　月　　　日', align: 'center' },
      { type: 'para', text: `本文件含個人資料，僅供交易雙方使用；如需索取電子檔請聯絡 ${sales.email}。`, align: 'center' },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// 客戶資料（Excel：60 筆客戶 + 聯絡紀錄 + 業務窗口）
// ---------------------------------------------------------------------------------------
export function customers(seed = 303): XlsxSpec {
  const f = new Fake(seed);
  const reps = Array.from({ length: 6 }, () => ({ name: f.name(), mobile: f.mobile(), ext: `${f.int(100, 899)}`, email: '' }));
  reps.forEach((r) => (r.email = f.email(r.name)));

  const customerRows: CellSpec[][] = [
    ['客戶編號', '姓名', '性別', '身分證字號', '生日', '手機', '市話', '電子郵件', '通訊地址', '公司', '統一編號', '職稱', '負責業務', '累計消費(元)', '備註'],
  ];
  const names: string[] = [];
  for (let i = 0; i < 60; i++) {
    const gender = f.int(1, 2) as 1 | 2;
    const name = f.name();
    names.push(name);
    const rep = f.pick(reps);
    const noteKind = f.chance();
    const note: CellSpec =
      noteKind < 0.25
        ? `${f.date()} 由 ${rep.name} 電訪，改用手機 ${f.mobile()} 聯絡`
        : noteKind < 0.4
          ? { rich: ['緊急聯絡人：', `${f.name()} ${f.mobile()}`] }
          : noteKind < 0.5
            ? `發票寄送地址：${f.address()}`
            : '';
    customerRows.push([
      `CUST-${String(10001 + i * 7)}`,
      name,
      gender === 1 ? '男' : '女',
      f.twId(gender),
      f.birthday(),
      f.mobile(),
      f.chance() < 0.7 ? f.landline() : '',
      f.email(name),
      f.address(),
      f.chance() < 0.8 ? f.company() : '',
      f.chance() < 0.8 ? f.taxId() : '',
      f.pick(['採購專員', '資訊經理', '總務', '負責人', '會計', '業務主管', '行政助理']),
      rep.name,
      f.int(12, 980) * 1000,
      note,
    ]);
  }

  const logRows: CellSpec[][] = [['日期', '客戶姓名', '客戶編號', '承辦業務', '聯絡方式', '摘要']];
  for (let i = 0; i < 30; i++) {
    const idx = f.int(0, 59);
    const rep = f.pick(reps);
    logRows.push([
      f.date(),
      names[idx],
      `CUST-${String(10001 + idx * 7)}`,
      rep.name,
      f.pick(['電話', '到訪', 'Email', '視訊']),
      f.pick([
        `客戶 ${names[idx]} 來電詢問報價，回撥 ${f.mobile()} 確認需求`,
        `寄送樣品至 ${f.address()}，簽收人 ${f.name()}`,
        `客戶更新聯絡信箱為 ${f.email(names[idx])}`,
        `拜訪客戶公司，與 ${f.name()}（${f.landline()}）洽談年度合約`,
        `客戶反映帳單地址有誤，更正為 ${f.address()}`,
        `視訊會議，客戶端出席 ${f.name()}、${f.name()}`,
      ]),
    ]);
  }

  const repRows: CellSpec[][] = [['業務', '分機', '手機', '電子郵件', '負責區域']];
  for (const r of reps) repRows.push([r.name, r.ext, r.mobile, r.email, f.pick(['北區', '中區', '南區', '東區'])]);

  return {
    sheets: [
      { name: '客戶資料', rows: customerRows },
      { name: '聯絡紀錄', rows: logRows },
      { name: '業務窗口', rows: repRows },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// 文字類：客服信件（txt）與會議紀錄（md）
// ---------------------------------------------------------------------------------------
export function supportEmail(seed = 404): string {
  const f = new Fake(seed);
  const c = f.name();
  const agent = f.name();
  const id = f.twId();
  return `主旨：Re: [客服單 #CS-2026-04471] 訂單 ORD-88213 出貨地址變更申請

${c} 您好：

感謝您的來信。已依您 ${f.date()} 來電（${f.mobile()}）之指示，將訂單 ORD-88213 的出貨地址由
「${f.address()}」
變更為
「${f.address()}」，
收件人維持 ${c}，聯絡電話 ${f.mobile()}。

為完成身分驗證，我們已核對您留存的身分證字號 ${id} 末四碼與電子郵件 ${f.email(c)}。若上述資料有誤，請於三日內回覆本信或致電客服專線 ${f.landline()}（分機 ${f.int(100, 999)}）。

另提醒您，本次訂單之發票將寄至 ${f.address()}，統一編號 ${f.taxId()}。

祝　順心

${agent}
客戶服務部
${f.company()}
電話 ${f.landline()}　手機 ${f.mobile()}
${f.email(agent)}

-----Original Message-----
From: ${c} <${f.email(c)}>
Sent: ${f.date()} 14:22
To: service@example.com.tw
Subject: [客服單 #CS-2026-04471] 訂單 ORD-88213 出貨地址變更申請

您好，我是 ${c}，想將訂單 ORD-88213 的出貨地址改到公司：${f.address()}，收件人 ${f.name()}，電話 ${f.mobile()}。
我的會員手機是 ${f.mobile()}，身分證末四碼 ${id.slice(-4)}。麻煩協助，謝謝。
`;
}

export function meetingNotes(seed = 505): string {
  const f = new Fake(seed);
  const people = Array.from({ length: 5 }, () => f.name());
  return `# 專案啟動會議紀錄

- **日期**：${f.date()} 14:00–15:30
- **地點**：${f.address()} 3 樓會議室
- **主席**：${people[0]}
- **出席**：${people.slice(1).join('、')}
- **記錄**：${people[4]}

## 討論事項

1. 客戶端窗口確認為 ${people[1]}（${f.mobile()}、${f.email(people[1])}），備援窗口 ${people[2]}（分機 ${f.int(100, 999)}）。
2. 測試環境帳號由 ${people[3]} 於本週五前建立，通知信寄至 ${f.email(people[3])}。
3. 設備送達地址：${f.address()}，收件人 ${people[2]}，電話 ${f.landline()}。
4. 保密協議簽署：乙方 ${people[4]}（身分證字號 ${f.twId()}）已於會前簽妥。

## 決議

| 項目 | 負責人 | 期限 |
| --- | --- | --- |
| 需求規格書 v1.0 | ${people[1]} | ${f.date()} |
| 測試環境建置 | ${people[3]} | ${f.date()} |
| 合約用印 | ${people[0]}（${f.mobile()}） | ${f.date()} |

## 待辦

- [ ] ${people[2]} 提供發票資訊（統一編號 ${f.taxId()}、地址 ${f.address()}）
- [ ] ${people[4]} 更新聯絡清單並寄給全體與會者
`;
}
