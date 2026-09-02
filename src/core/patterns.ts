import type { Pattern } from './types';
import { isValidTaxId, isValidTwId } from './twid';

const CJK = '\\u4e00-\\u9fa5';

const CITIES =
  '(?:[臺台]北市|新北市|桃園市|[臺台]中市|[臺台]南市|高雄市|基隆市|新竹[市縣]|嘉義[市縣]|苗栗縣|彰化縣|南投縣|雲林縣|屏東縣|宜蘭縣|花蓮縣|[臺台]東縣|澎湖縣|金門縣|連江縣)';
const DISTRICT = `(?:[${CJK}]{1,4}[鄉鎮市區])?`;
const ROAD = `(?:[${CJK}\\d]{1,8}(?:路|街|大道))`;
const ADDRESS_TAIL =
  `(?:[${CJK}]{1,4}[村里])?(?:\\d{1,3}鄰)?` +
  `(?:[一二三四五六七八九十\\d]{1,3}段)?(?:\\d{1,4}巷)?(?:\\d{1,4}弄)?` +
  `\\d{1,5}(?:之\\d{1,3})?號(?:[\\d一二三四五六七八九十]{1,3}樓)?(?:之\\d{1,3})?(?:[${CJK}\\d]{1,3}室)?`;

const ADDRESS_REGEX =
  `(?:${CITIES}${DISTRICT}(?:[${CJK}]{1,4}[村里])?(?:\\d{1,3}鄰)?${ROAD}?` +
  `|(?<![${CJK}])${DISTRICT}${ROAD})` +
  ADDRESS_TAIL;

/** Organisation suffixes that reliably end a company name; bare 公司 is too ambiguous (本公司, 公司電話). */
const COMPANY_SUFFIX = '(?:股份有限公司|有限公司|無限公司|兩合公司|企業社|工作室|事務所|商行|診所|基金會|協會|合作社|工程行|企業行|實業社|文化事業)';
/** Characters that never start a company name but often precede one in prose. */
const COMPANY_NOT_FIRST = '的與和及於在由向從為對將把讓依據至到給經受同各該本貴我敝此其係即為者以並或如';
const COMPANY_REGEX = `(?:(?![${COMPANY_NOT_FIRST}])[${CJK}A-Za-z0-9&·]){2,14}?${COMPANY_SUFFIX}`;

const COMPOUND_SURNAMES = '歐陽|司馬|諸葛|上官|張簡|范姜|司徒|東方|令狐|南宮|端木|皇甫|尉遲|夏侯';
const SINGLE_SURNAMES =
  '陳林黃張李王吳劉蔡楊許鄭謝郭洪邱曾廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯曹薛丁卓阮馬董溫唐藍蔣石古紀姚連馮歐程湯田康姜白汪鄒尤巫鐘黎塗龔嚴韓袁金童陸夏柳邵錢伍倪甘秦官辛戚易祝樊喬向殷凌闕舒包鮑冉牛管毛涂';

/** Contexts that commonly follow a person's name; keeps 2-vs-3 char names from over-capturing. */
const NAME_FOLLOW =
  '(?=$|[\\s\\d\\p{P}A-Za-z]|先生|小姐|女士|同學|醫師|醫生|護理師|老師|律師|經理|主任|董事|總監|組長|課長|科長|處長|局長|部長|教授|博士|君|兄|姐|哥|等|表示|說|指出|認為|於|在|與|和|及|為|所|之|的|已|將|曾|因|向|由|係|即|亦|並|或' +
  '|另|也|則|更|未|不|有|無|是|非|對|從|自|以|被|經|卻|還|又|再|但|而|才|都|皆|均|便|就|會|能|可|應|須|要|想|願|正|到|來|去|至|提|收|付|持|稱|同意|聲明|陳述|申請|提供|前往|出席|簽|辦理|負責|擔任|購買|支付|領取|遞交|回覆|聯絡|通知|告知)';

/** Characters that essentially never appear inside a given name; used by the fallback branch below. */
const NAME_STOP_CHARS =
  '的了是在有和與及於為等所之已將因向由係即亦並或另也則未不無非對從自以被經卻還又再但而才都皆均便就會能可應須要想願到來去至收付持稱接提說表指認出簽辦負擔購支領遞回聯通告這那該此其每各們呢嗎吧啊麼什怎很太最曾先女士請讓使給把被令將於當若如則個';

/**
 * Branch 1: 1–2 name chars followed by a known context word (precise for 2-vs-3 char names).
 * Branch 2: exactly 2 name chars that are not function words (recall when the next word is unknown).
 */
const NAME_REGEX =
  `(?:${COMPOUND_SURNAMES}|[${SINGLE_SURNAMES}])` +
  `(?:[${CJK}]{1,2}${NAME_FOLLOW}|(?:(?![${NAME_STOP_CHARS}])[${CJK}]){2})`;

/** Common words that start with a surname character but are not names. */
const NAME_STOPLIST = new Set([
  '王國', '王子', '王牌', '李子', '張開', '張貼', '張力', '陳述', '陳列', '陳舊', '林口', '林業', '林地',
  '高雄', '高速', '高中', '高級', '高度', '高溫', '高血', '黃金', '黃色', '黃昏', '吳郭', '何時', '何況',
  '何人', '何處', '何等', '何種', '何者', '何以', '何不', '何在', '何其', '何去',
  '何謂', '馬上', '馬路', '周年', '周末', '周邊', '周圍', '方法', '方面', '方向', '方式', '方案', '許多',
  '許可', '江山', '江湖', '白色', '白天', '白血', '黑色', '金門', '金額', '金融', '金屬', '金錢', '長期',
  '文件', '文化', '石頭', '程式', '程度', '康復', '常見', '章節', '施工', '施行', '萬一', '羅列', '夏天',
  '夏季', '史上', '田地', '余額', '毛病', '任何', '任務', '古代', '古蹟', '紀錄', '紀念', '連結', '連續',
  '連接', '連線', '溫度', '溫暖', '唐朝', '藍色', '石油', '康健', '姜母', '白天', '汪洋', '童年', '陸地',
  '柳樹', '錢包', '甘心', '秦朝', '官方', '官員', '易於', '祝福', '喬木', '向來', '凌晨', '舒服', '包含',
  '包括', '包裝', '鮑魚', '牛肉', '牛奶', '管理', '毛巾', '柯南', '翁婿', '魏晉', '孫子', '戴上', '范圍',
  '宋朝', '杜絕', '侯爵', '曹操', '丁點', '卓越', '馬克', '董事', '藍圖', '蔣公', '石膏', '鄧小', '傅立',
  '梁柱', '趙錢', '顏色', '簡單', '簡介', '簡稱', '朱紅', '鍾情', '游泳', '游戲', '詹姆', '胡說', '胡椒',
  '沈默', '盧比', '呂宋', '江西', '何必', '蕭條', '羅馬', '羅列', '高雄', '潘朵', '莊園', '蘇打', '葉子',
  '徐徐', '廖化', '賴床', '曾經', '洪水', '郭台', '謝謝', '鄭重', '許願', '蔡英', '劉海', '吳哥', '楊桃',
  '張三', '李四', '王五', '謝絕', '謝意', '許久', '賴以', '曾任', '洪流', '邱比', '徐步', '廖若', '莊嚴',
  '管轄', '管制', '管線', '管道', '管控', '溫濕', '溫馨', '溫室', '何疑', '易雙', '謝您', '謝函', '謝禮', '高層', '高額',
  '方為', '牛市', '包商', '向下', '向上', '任一', '安全', '安裝', '安排',
]);

/** "X方" in contracts/legal text (甲方、乙方、雙方、他方…) is a party, not a person surnamed 方. */
const PARTY_PREFIX = /[甲乙丙丁雙各買賣我他貴對本該多官軍校院廠資勞前後男女一二三四五六七八九十任另每]$/u;

function isPlausibleName(m: string, before = ''): boolean {
  if (NAME_STOPLIST.has(m.slice(0, 2))) return false;
  if (/(.)\1/.test(m) && m.length === 2) return false;
  if (m.startsWith('方') && PARTY_PREFIX.test(before)) return false;
  if (m.startsWith('何') && /[任如為幾若奈無]$/u.test(before)) return false; // 任何、如何、幾何…
  return true;
}

export const BUILTIN_PATTERNS: Pattern[] = [
  {
    id: 'zh-name',
    name: '中文姓名',
    category: '姓名',
    source: 'builtin',
    regex: NAME_REGEX,
    example: '王小明、歐陽志遠',
    enabled: true,
    validate: isPlausibleName,
  },
  {
    id: 'tw-id',
    name: '台灣身分證字號',
    category: '身分證',
    source: 'builtin',
    regex: '(?<![A-Za-z0-9])[A-Z][12]\\d{8}(?!\\d)',
    example: 'A123456789',
    enabled: true,
    validate: isValidTwId,
  },
  {
    id: 'tw-mobile',
    name: '手機號碼',
    category: '手機',
    source: 'builtin',
    regex: '(?<![\\d+])(?:\\+886[-\\x20]?9|09)\\d{2}[-\\x20]?\\d{3}[-\\x20]?\\d{3}(?!\\d)',
    example: '0912-345-678、0912345678、+886-912-345-678',
    enabled: true,
  },
  {
    id: 'tw-landline',
    name: '市話號碼',
    category: '市話',
    source: 'builtin',
    // Separated/parenthesised forms, or unseparated forms with the exact digit count per area
    // code (02/04: 10 digits, 03–08: 9, 082/089: 9, 0826/0836: 9) so an 8-digit 統編 is never a 市話.
    regex:
      '(?<![\\d(])(?:\\(0(?:826|836|82|89|37|49|[2-8])\\)[-\\x20]?\\d{3,4}[-\\x20]?\\d{3,4}' +
      '|0(?:826|836|82|89|37|49|[2-8])[-\\x20]\\d{3,4}[-\\x20]?\\d{3,4}' +
      '|0[24]\\d{8}|0[3-8]\\d{7}|08[29]\\d{6}|08[23]6\\d{5})(?!\\d)',
    example: '(02)2712-3456、02-27123456、0227123456、037-123456',
    enabled: true,
  },
  {
    id: 'tw-address',
    name: '台灣地址',
    category: '地址',
    source: 'builtin',
    regex: ADDRESS_REGEX,
    example: '台北市信義區市府路45號8樓',
    enabled: true,
  },
  {
    id: 'tw-company',
    name: '公司／組織名稱',
    category: '公司',
    source: 'builtin',
    regex: COMPANY_REGEX,
    example: '築夢實業股份有限公司、大安聯合診所',
    enabled: true,
  },
  {
    id: 'tw-tax-id',
    name: '統一編號',
    category: '統編',
    source: 'builtin',
    regex: '(?<![\\d-])\\d{8}(?![\\d-])',
    example: '統一編號 04595257',
    enabled: true,
    validate: isValidTaxId,
  },
  {
    id: 'email',
    name: '電子郵件',
    category: '電子郵件',
    source: 'builtin',
    regex: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
    example: 'someone@example.com',
    enabled: true,
  },
];
