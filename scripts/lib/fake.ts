// Deterministic fake data for realistic example documents. All values are fictional.

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Fake {
  private r: () => number;
  constructor(seed = 20260902) {
    this.r = rng(seed);
  }
  /** Uniform [0, 1). */
  chance(): number {
    return this.r();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.r() * (max - min + 1));
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.r() * list.length)];
  }
  digits(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += this.int(0, 9);
    return s;
  }

  name(): string {
    const compound = this.r() < 0.04;
    const surname = compound ? this.pick(COMPOUND) : this.pick(SURNAMES);
    const given = this.pick(GIVEN_1) + (this.r() < 0.9 ? this.pick(GIVEN_2) : '');
    return surname + given;
  }

  /** Valid Taiwan national ID with correct check digit. */
  twId(gender: 1 | 2 = this.r() < 0.5 ? 1 : 2): string {
    const letter = this.pick('ABCDEFGHJKLMNPQRSTUVXYZ'.split(''));
    const body = `${letter}${gender}${this.digits(7)}`;
    const n = LETTER_VALUES[letter];
    let sum = Math.floor(n / 10) + (n % 10) * 9;
    const w = [8, 7, 6, 5, 4, 3, 2, 1];
    body
      .slice(1)
      .split('')
      .forEach((d, i) => (sum += Number(d) * w[i]));
    return body + ((10 - (sum % 10)) % 10);
  }

  mobile(): string {
    const d = `09${this.digits(8)}`;
    const style = this.r();
    if (style < 0.5) return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
    if (style < 0.8) return d;
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }

  landline(): string {
    const area = this.pick(['02', '02', '02', '03', '04', '05', '06', '07', '037', '049']);
    const local = area === '02' ? this.digits(8) : this.digits(7);
    const style = this.r();
    if (style < 0.4) return `(${area})${local.slice(0, 4)}-${local.slice(4)}`;
    if (style < 0.8) return `${area}-${local.slice(0, 4)}-${local.slice(4)}`;
    return `${area}-${local}`;
  }

  address(): string {
    const [city, districts] = this.pick(CITIES);
    const district = this.pick(districts);
    const road = this.pick(ROADS) + this.pick(['路', '路', '街', '大道']);
    const section = this.r() < 0.5 ? `${this.pick(['一', '二', '三', '四', '五'])}段` : '';
    const lane = this.r() < 0.4 ? `${this.int(1, 300)}巷` : '';
    const alley = lane && this.r() < 0.4 ? `${this.int(1, 40)}弄` : '';
    const no = `${this.int(1, 500)}${this.r() < 0.15 ? `之${this.int(1, 9)}` : ''}號`;
    const floor = this.r() < 0.5 ? `${this.int(1, 20)}樓${this.r() < 0.3 ? `之${this.int(1, 5)}` : ''}` : '';
    return `${city}${district}${road}${section}${lane}${alley}${no}${floor}`;
  }

  email(name?: string): string {
    const user = name ? romanize(name, this) : this.pick(['service', 'sales', 'info', 'contact']);
    return `${user}${this.r() < 0.5 ? '' : this.int(1, 99)}@${this.pick(DOMAINS)}`;
  }

  company(): string {
    return `${this.pick(COMPANY_A)}${this.pick(COMPANY_B)}${this.pick(['股份有限公司', '有限公司', '股份有限公司'])}`;
  }

  /** 8-digit unified business number with a valid checksum. */
  taxId(): string {
    const head = this.digits(7);
    const w = [1, 2, 1, 2, 1, 2, 4, 1];
    for (let last = 0; last < 10; last++) {
      const id = head + last;
      let total = 0;
      for (let i = 0; i < 8; i++) {
        const p = Number(id[i]) * w[i];
        total += Math.floor(p / 10) + (p % 10);
      }
      if (total % 5 === 0) return id;
    }
    return head + '0';
  }

  date(year = 2026): string {
    return `${year}-${String(this.int(1, 12)).padStart(2, '0')}-${String(this.int(1, 28)).padStart(2, '0')}`;
  }

  birthday(): string {
    return `${this.int(1955, 2002)}-${String(this.int(1, 12)).padStart(2, '0')}-${String(this.int(1, 28)).padStart(2, '0')}`;
  }

  bankAccount(): string {
    return `${this.pick(['004', '005', '007', '012', '013', '017', '822'])}-${this.digits(4)}-${this.digits(6)}-${this.digits(2)}`;
  }
}

function romanize(name: string, f: Fake): string {
  const parts: string[] = [];
  for (const ch of name) parts.push(PINYIN[ch] ?? `x${f.int(1, 9)}`);
  return parts.join('.');
}

const LETTER_VALUES: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21,
  N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

const SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝郭洪邱曾廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯曹薛丁卓阮馬董溫唐藍蔣'.split('');
const COMPOUND = ['歐陽', '張簡', '范姜', '司徒'];
const GIVEN_1 = '志明美佳怡家俊宗淑雅建冠文宜柏雨承思宇欣品彥嘉語子育芳婉士詩靜柔宏博'.split('');
const GIVEN_2 = '華玲豪伶婷翰安琪儀誠慧宏慈婕澤瑄軒萱恩妤翔霖蓉庭如芸真彤瑜綺瑋倫芷'.split('');
const PINYIN: Record<string, string> = {
  陳: 'chen', 林: 'lin', 黃: 'huang', 張: 'chang', 李: 'lee', 王: 'wang', 吳: 'wu', 劉: 'liu', 蔡: 'tsai', 楊: 'yang',
  許: 'hsu', 鄭: 'cheng', 謝: 'hsieh', 郭: 'kuo', 洪: 'hung', 邱: 'chiu', 曾: 'tseng', 廖: 'liao', 賴: 'lai', 徐: 'hsu',
  周: 'chou', 葉: 'yeh', 蘇: 'su', 莊: 'chuang', 呂: 'lu', 江: 'chiang', 何: 'ho', 蕭: 'hsiao', 羅: 'lo', 高: 'kao',
  潘: 'pan', 簡: 'chien', 朱: 'chu', 鍾: 'chung', 游: 'yu', 彭: 'peng', 詹: 'chan', 胡: 'hu', 施: 'shih', 沈: 'shen',
  志: 'chih', 明: 'ming', 美: 'mei', 佳: 'chia', 怡: 'yi', 家: 'chia', 俊: 'chun', 宗: 'tsung', 淑: 'shu', 雅: 'ya',
  建: 'chien', 冠: 'kuan', 文: 'wen', 宜: 'yi', 柏: 'po', 雨: 'yu', 承: 'cheng', 思: 'szu', 宇: 'yu', 欣: 'hsin',
  品: 'pin', 彥: 'yen', 嘉: 'chia', 語: 'yu', 子: 'tzu', 育: 'yu', 芳: 'fang', 婉: 'wan', 士: 'shih', 詩: 'shih',
  靜: 'ching', 柔: 'jou', 宏: 'hung', 博: 'po', 華: 'hua', 玲: 'ling', 豪: 'hao', 伶: 'ling', 婷: 'ting', 翰: 'han',
  安: 'an', 琪: 'chi', 儀: 'yi', 誠: 'cheng', 慧: 'hui', 慈: 'tzu', 婕: 'chieh', 澤: 'tse', 瑄: 'hsuan', 軒: 'hsuan',
  萱: 'hsuan', 恩: 'en', 妤: 'yu', 翔: 'hsiang', 霖: 'lin', 蓉: 'jung', 庭: 'ting', 如: 'ju', 芸: 'yun', 真: 'chen',
  彤: 'tung', 瑜: 'yu', 綺: 'chi', 瑋: 'wei', 倫: 'lun', 芷: 'chih',
  余: 'yu', 盧: 'lu', 梁: 'liang', 趙: 'chao', 顏: 'yen', 柯: 'ko', 翁: 'weng', 魏: 'wei', 孫: 'sun', 戴: 'tai',
  范: 'fan', 方: 'fang', 宋: 'sung', 鄧: 'teng', 杜: 'tu', 傅: 'fu', 侯: 'hou', 曹: 'tsao', 薛: 'hsueh', 丁: 'ting',
  卓: 'cho', 阮: 'juan', 馬: 'ma', 董: 'tung', 溫: 'wen', 唐: 'tang', 藍: 'lan', 蔣: 'chiang', 歐: 'ou', 陽: 'yang',
  姜: 'chiang', 司: 'szu', 徒: 'tu',
};
const DOMAINS = ['example.com', 'example.com.tw', 'mail.example.org', 'corp-example.tw', 'example.net'];
const COMPANY_A = ['宏達', '嘉宏', '聯成', '晶華', '永豐', '泰宇', '鼎新', '博盛', '瑞邦', '禾豐', '築夢', '雲創', '智联', '欣業', '瀚宇'];
const COMPANY_B = ['科技', '資訊', '工程', '國際', '企業', '實業', '顧問', '數位', '網路', '生技'];
const ROADS = ['中山', '中正', '民生', '民權', '忠孝', '仁愛', '信義', '和平', '復興', '光復', '建國', '南京', '重慶', '博愛', '文化', '自由', '三民', '中華', '成功', '大同', '中港', '台灣', '公益', '市府', '府前', '四維', '五福', '青年', '林森', '長安'];
const CITIES: [string, string[]][] = [
  ['台北市', ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區']],
  ['新北市', ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '汐止區', '樹林區', '淡水區', '林口區']],
  ['桃園市', ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '龜山區', '龍潭區']],
  ['台中市', ['中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '太平區', '大里區', '豐原區']],
  ['台南市', ['中西區', '東區', '南區', '北區', '安平區', '安南區', '永康區', '仁德區']],
  ['高雄市', ['新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '三民區', '左營區', '楠梓區', '鳳山區', '前鎮區']],
  ['新竹市', ['東區', '北區', '香山區']],
  ['新竹縣', ['竹北市', '竹東鎮', '湖口鄉']],
  ['彰化縣', ['彰化市', '員林市', '鹿港鎮']],
  ['宜蘭縣', ['宜蘭市', '羅東鎮', '礁溪鄉']],
];
