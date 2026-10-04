/**
 * @Sub-Store-Page
 *
 * CloudRename v1.1.3
 * 本地机场节点分类、信息提取与重命名脚本
 *
 * 输出格式：
 * 国旗|机场名|地区序号|等级/线路/IP 属性/用途|倍率
 *
 * 示例：
 * 🇭🇰|XSUS|香港01|0.8x
 * 🇭🇰|FlowerCloud|香港01|实验性|IEPL|专线
 *
 * 根据国旗、国家代码、国家/城市名称及元数据识别地区。
 * 完整长名称优先；保留等级、线路、IP 属性、用途、倍率和自定义标签。
 * 本地处理，无外部请求；支持伪节点过滤、长度限制和重名去重。
 *
 * 参数：
 * drop_info=1       过滤流量/到期/官网/通知类伪节点，默认 1
 * mode=prefix       prefix=覆盖为新名；suffix=追加到原名后；off=不改名
 * show_line=1       显示所有描述标签的总开关，默认 1
 * show_tier=1       显示高级/标准/旗舰/实验性等等级标签
 * show_route=1      显示 IEPL/IPLC/CN2/专线/中转等线路标签
 * show_ip_type=1    显示住宅/家宽/原生/独享/动态等 IP 属性
 * show_feature=1    显示游戏/流媒体/AI/备用/低延迟等用途标签
 * show_rate=1       显示倍率，默认 1
 * dedupe=1          重名节点追加 #2/#3，默认 1；mode=off 时不生效
 * provider=xxx      手动覆盖机场名
 * keep_unknown=1    保留未识别地区节点，默认 1
 * max_tags=24       最多保留的描述标签数，默认 24
 * max_line_tags=24  max_tags 的兼容别名
 * custom_tags=xxx   额外关键词，逗号分隔，如 静态住宅,精品线路
 * show_extra=1      保留括号或“等级:星耀”等明示的未收录描述；默认 1
 * use_metadata=1    名称未命中时读取节点国家/地区元数据，默认 1
 * show_flag=1       显示国旗，默认 1
 * show_provider=1   显示机场名，默认 1
 * show_region=1     显示地区名，默认 1
 * show_seq=1        地区名后显示两位序号，默认 1
 * seq_width=2       地区序号最小宽度，范围 1~4
 * separator=|       输出字段分隔符
 * name_len=95       节点名称最大长度，范围 32~256
 * debug=0           输出耗时、过滤及识别统计
 *
 * 推荐参数：
 * #drop_info=1&mode=prefix&show_line=1&max_tags=24&show_rate=1&dedupe=1
 */

const SCRIPT_VERSION = "1.1.3";

const UNKNOWN_REGION = Object.freeze({
  code: "OT",
  name: "其他",
  flag: "🏳️",
});

const GLOBAL_REGION = Object.freeze({
  code: "GL",
  name: "全球",
  flag: "🌐",
});

const GLOBAL_REGION_RE = /(^|\s)(?:global|worldwide|auto)(?=\s|$)|全球|世界|自动选择/i;

const INFO_HARD_RE =
  /剩余流量|已用流量|可用流量|流量重置|套餐到期|到期时间|过期时间|(?:^|[^a-z])(?:traffic|expire|expires|expiration)\s*:/i;

const INFO_SOFT_ZH_RE = /官网|网站|网址|订阅|更新|通知|公告|提示|用户|账户|客服|工单/;

const INFO_SOFT_EN_RE =
  /(?:^|[^a-z])(?:subscription|remaining|remain|used|total|reset|renew|notice|official|website)(?=$|[^a-z])/i;

const INFO_TRAFFIC_ONLY_RE =
  /^\s*(?:traffic\s*:)?\s*\d+(?:\.\d+)?\s*(?:kb|mb|gb|tb|kib|mib|gib|tib)\s*[|/]\s*\d+(?:\.\d+)?\s*(?:kb|mb|gb|tb|kib|mib|gib|tib)\s*$/i;

const INFO_EXPIRE_ONLY_RE =
  /^\s*(?:expire|expires|expiration)\s*[:：]\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*$/i;

const USAGE_RE = /\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB|TiB|GiB|MiB|KiB|T|G|M|K)\b/i;

const EXPIRE_RE =
  /(?:\d+\s*(?:D|天|日)|\d+\s*(?:H|时|小时)|到期|过期|剩余|(?:^|[^a-z])(?:expire|expired|expiration)(?=$|[^a-z]))/i;

const RATE_RE =
  /(?:倍率|rate|倍速)\s*[:：=]?\s*[x×*]?\s*(\d+(?:\.\d+)?)|(?:^|[\s|｜_\-/\\[(（])(?:x|×|\*)\s*(\d+(?:\.\d+)?)(?=$|[\s|｜_\-/\\\])）])|(\d+(?:\.\d+)?)\s*(?:倍率|倍|x|×)(?=$|[\s|｜_\-/\\\])）])/i;

// 具体线路先于通用线路，避免 CN2 GIA 同时产出 CN2。
// prettier-ignore
const TAG_RULES = Object.freeze([
  [/\bCN2\s*GIA\b/i, "CN2 GIA", "route"],
  [/\bCN2\b/i, "CN2", "route"],
  [/\bIEPL\b/i, "IEPL", "route"],
  [/\bIPLC\b/i, "IPLC", "route"],
  [/\bCMIN?2\b/i, "CMIN2", "route"],
  [/\bCMI\b/i, "CMI", "route"],
  [/\b(?:AS)?9929\b/i, "AS9929", "route"],
  [/\b(?:AS)?4837\b/i, "AS4837", "route"],
  [/\bCU\s*(?:VIP|II)\b/i, "CU VIP", "route"],
  [/\bBGP\b/i, "BGP", "route"],
  [/三网优化|三網優化|三网回程|三網回程/i, "三网优化", "route"],
  [/三网直连|三網直連/i, "三网直连", "route"],
  [/精品网|精品網/i, "精品网", "route"],
  [/\bMPLS\b/i, "MPLS", "route"],
  [/\bIIJ\b/i, "IIJ", "route"],
  [/\bNTT\b/i, "NTT", "route"],
  [/\bBBTEC\b/i, "BBTEC", "route"],
  [/\bPCCW\b/i, "PCCW", "route"],
  [/\bHKT\b/i, "HKT", "route"],
  [/\bSoftBank\b/i, "SoftBank", "route"],
  [/专线|專線|\b(?:dedicated|private)\s+line\b/i, "专线", "route"],
  [/中转|中轉|中繼|\brelay\b/i, "中转", "route"],
  [/隧道|\btunnel\b/i, "隧道", "route"],
  [/直连|直連|\bdirect\b/i, "直连", "route"],
  [/落地|\bexit\s*(?:node|server)?\b/i, "落地", "route"],
  [/入口|\bentry\s*(?:node|server)?\b/i, "入口", "route"],
  [/实验性|實驗性|\bexperimental\b/i, "实验性", "tier"],
  [/实验|實驗|试验|試驗|\bpreview\b/i, "实验", "tier"],
  [/测试|測試|\b(?:test|beta)\b/i, "测试", "tier"],
  [/内测|內測|\b(?:alpha|internal\s*test)\b/i, "内测", "tier"],
  [/公测|公測|\bpublic\s*beta\b/i, "公测", "tier"],
  [/旗舰|旗艦|\bflagship\b/i, "旗舰", "tier"],
  [/高级|高級|\bpremium\b/i, "高级", "tier"],
  [/高端/i, "高端", "tier"],
  [/顶级|頂級/i, "顶级", "tier"],
  [/至尊/i, "至尊", "tier"],
  [/尊享/i, "尊享", "tier"],
  [/臻享/i, "臻享", "tier"],
  [/优选|優選/i, "优选", "tier"],
  [/优享|優享/i, "优享", "tier"],
  [/精选|精選/i, "精选", "tier"],
  [/专业|專業|\bpro\b/i, "专业", "tier"],
  [/进阶|進階|\badvanced\b/i, "进阶", "tier"],
  [/标准|標準|\bstandard\b/i, "标准", "tier"],
  [/黄金|黃金|\bgold\b/i, "黄金", "tier"],
  [/铂金|鉑金|白金|\bplatinum\b/i, "铂金", "tier"],
  [/钻石|鑽石|\bdiamond\b/i, "钻石", "tier"],
  [/白银|白銀|\bsilver\b/i, "白银", "tier"],
  [/精品|\belite\b/i, "精品", "tier"],
  [/基础|基礎|入门|入門|\bbasic\b/i, "基础", "tier"],
  [/普通|\bnormal\b/i, "普通", "tier"],
  [/\bSVIP\b/i, "SVIP", "tier"],
  [/\bVIP\b/i, "VIP", "tier"],
  [/企业|企業|\benterprise\b/i, "企业", "tier"],
  [/商宽|商寬|\bbusiness\s*broadband\b/i, "商宽", "ip"],
  [/商务|商務|\bbusiness\b/i, "商务", "tier"],
  [/轻量|輕量|\blite\b/i, "轻量", "tier"],
  [/试用|試用|\btrial\b/i, "试用", "tier"],
  [/体验|體驗/i, "体验", "tier"],
  [/限量/i, "限量", "tier"],
  [/限定|\blimited\b/i, "限定", "tier"],
  [/\bplus\b/i, "PLUS", "tier"],
  [/\bultra\b/i, "ULTRA", "tier"],
  [/\bmax\b/i, "MAX", "tier"],
  [/免费|\bfree\b/i, "免费", "tier"],
  [/双ISP|雙ISP|\bdual\s*isp\b/i, "双ISP", "ip"],
  [/\bISP\b/i, "ISP", "ip"],
  [/家宽|家寬|\bhome\s*(?:broadband|ip)\b/i, "家宽", "ip"],
  [/家庭宽带|家庭寬頻|家庭宽頻/i, "家宽", "ip"],
  [/住宅(?:IP)?|\bresidential(?:\s*ip)?\b/i, "住宅", "ip"],
  [/原生(?:IP)?|\bnative\s*ip\b/i, "原生", "ip"],
  [/数据中心|數據中心|机房|機房|\b(?:datacenter|data\s*center)\b/i, "机房", "ip"],
  [/独享|獨享|独立IP|獨立IP|\bdedicated\s*ip\b/i, "独享", "ip"],
  [/共享|共用|\bshared\s*ip\b/i, "共享", "ip"],
  [/动态(?:IP)?|動態(?:IP)?|\bdynamic\s*ip\b/i, "动态", "ip"],
  [/静态(?:IP)?|靜態(?:IP)?|\bstatic\s*ip\b/i, "静态", "ip"],
  [/广播(?:IP)?|廣播(?:IP)?|\bbroadcast\s*ip\b/i, "广播", "ip"],
  [/双栈|雙棧|\bdual\s*stack\b/i, "双栈", "ip"],
  [/公网(?:IP)?|公網(?:IP)?|\bpublic\s*ip\b/i, "公网", "ip"],
  [/运营商|運營商|電信級|电信级/i, "运营商", "ip"],
  [/\bNAT\b/i, "NAT", "ip"],
  [/\bIPv6\b/i, "IPv6", "ip"],
  [/\bIPv4\b/i, "IPv4", "ip"],
  [/低延迟|低延遲|\blow\s*latency\b/i, "低延迟", "feature"],
  [/高速|极速|極速|\bfast\b/i, "高速", "feature"],
  [/稳定|穩定|\bstable\b/i, "稳定", "feature"],
  [/备用|備用|\bbackup\b/i, "备用", "feature"],
  [/优化|優化|\boptimized\b/i, "优化", "feature"],
  [/大带宽|高带宽|大頻寬|高頻寬|\bhigh\s*bandwidth\b/i, "大带宽", "feature"],
  [/高防|\bDDoS\s*protection\b/i, "高防", "feature"],
  [/负载均衡|負載均衡|\bload\s*balancing\b/i, "负载均衡", "feature"],
  [/白名单|白名單|\bwhitelist\b/i, "白名单", "feature"],
  [/游戏|遊戲|\bgame\b/i, "游戏", "feature"],
  [/流媒体|流媒體|\bstreaming\b/i, "流媒体", "feature"],
  [/解锁|解鎖|\bunlock\b/i, "解锁", "feature"],
  [/\b(?:Netflix|NF)\b|网飞|網飛|奈飞|奈飛/i, "Netflix", "feature"],
  [/\bDisney(?:\+|\b)|迪士尼/i, "Disney+", "feature"],
  [/\bHBO\b/i, "HBO", "feature"],
  [/\bHulu\b/i, "Hulu", "feature"],
  [/\bSpotify\b/i, "Spotify", "feature"],
  [/\bPrime\s*Video\b/i, "Prime Video", "feature"],
  [/\bYouTube\b/i, "YouTube", "feature"],
  [/\bTikTok\b|抖音海外版/i, "TikTok", "feature"],
  [/\b(?:ChatGPT|OpenAI|GPT)\b/i, "ChatGPT", "feature"],
  [/\bGemini\b/i, "Gemini", "feature"],
  [/\bClaude\b/i, "Claude", "feature"],
  [/\bAI\b|人工智能|人工智慧/i, "AI", "feature"],
  [/防封|\banti[- ]?ban\b/i, "防封", "feature"],
  [/\bUDP\b/i, "UDP", "feature"],
]);
const TAG_MASTER_RE = new RegExp(
  TAG_RULES.map(([pattern]) => `(${pattern.source})`).join("|"),
  "gi",
);
const TAG_PRIORITY = Object.freeze({
  tier: 0,
  custom: 1,
  route: 2,
  ip: 3,
  feature: 4,
  extra: 5,
});
const EXTRA_BRACKET_RE =
  /\[([^\]\r\n]{1,24})\]|【([^】\r\n]{1,24})】|（([^）\r\n]{1,24})）|\(([^)\r\n]{1,24})\)/g;
const EXTRA_FIELD_RE =
  /(等级|等級|级别|級別|档位|檔位|套餐|计划|計劃|版型|线路|線路|特性|标签|標籤)\s*[:：=]\s*([A-Za-z0-9\u00c0-\u024f\u3400-\u9fff+_.-]{2,16})/g;

const MODE_VALUES = new Set(["prefix", "suffix", "off"]);
const PROTOCOL_NAME_RE =
  /^(?:vless|vmess|trojan|ss|ssr|shadowsocks|hysteria2?|hy2|tuic|anytls|wireguard|socks5?|http)$/i;
const REGION_PART_SPLIT_RE = /[\s|｜_\-/\\:：,，.;；()[\]{}<>]+/;
const NUMBERED_TOKEN_RE = /^([a-z]{2,3})(\d{1,3})$/;
const LATIN_DIACRITIC_RE = /[\u00c0-\u024f\u1e00-\u1eff]/;
const COMBINING_MARK_RE = /[\u0300-\u036f]/g;
const FLAG_PAIR_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
const FLAG_ALL_RE = /[\u{1F1E6}-\u{1F1FF}]/gu;
const GENERIC_REGION_ICON_RE = /[\u{1F3F3}\u{1F310}\uFE0F]/gu;
const REGION_METADATA_KEYS = Object.freeze([
  "countryCode",
  "country_code",
  "_countryCode",
  "_country",
  "country",
  "region",
  "location",
]);
const PROVIDER_METADATA_KEYS = Object.freeze([
  "_subDisplayName",
  "_subName",
  "_collectionName",
  "subName",
  "collectionName",
  "provider",
]);

/*
 * 每行格式：
 * [ISO 两位代码, 中文输出名, ...别名]
 *
 * 与原扩展版地区表保持一致；使用紧凑数组是为了降低脚本体积和初始化开销。
 */
// prettier-ignore
const REGION_ROWS = [
  ["HK", "香港", "香港", "hong kong", "hkg", "hk"],
  ["TW", "台湾", "台湾", "台灣", "台北", "新北", "高雄", "taiwan", "taipei", "tpe", "khh", "tw"],
  ["MO", "澳门", "澳门", "澳門", "macao", "macau", "mfm", "mo"],
  ["CN", "中国", "中国", "中國", "大陆", "大陸", "北京", "上海", "广州", "廣州", "深圳", "china", "beijing", "shanghai", "guangzhou", "shenzhen", "pek", "pvg", "sha", "can", "szx", "cn"],
  ["JP", "日本", "日本", "东京", "東京", "大阪", "埼玉", "名古屋", "福冈", "福岡", "japan", "tokyo", "osaka", "nagoya", "fukuoka", "nrt", "hnd", "kix", "ngo", "fuk", "jpn", "jp"],
  ["SG", "新加坡", "新加坡", "狮城", "獅城", "singapore", "sin", "sg"],
  ["KR", "韩国", "韩国", "韓国", "韓國", "首尔", "首爾", "釜山", "korea", "south korea", "seoul", "busan", "icn", "gmp", "pus", "kor", "kr"],
  ["KP", "朝鲜", "朝鲜", "朝鮮", "north korea", "dprk", "kp"],
  ["US", "美国", "美国", "美國", "美西", "美东", "美東", "洛杉矶", "洛杉磯", "圣何塞", "聖何塞", "西雅图", "西雅圖", "纽约", "紐約", "达拉斯", "達拉斯", "芝加哥", "迈阿密", "邁阿密", "凤凰城", "鳳凰城", "拉斯维加斯", "拉斯維加斯", "united states", "america", "los angeles", "san jose", "seattle", "new york", "dallas", "chicago", "miami", "phoenix", "las vegas", "lax", "sjc", "sea", "nyc", "jfk", "dfw", "ord", "mia", "phx", "las", "usa", "us"],
  ["CA", "加拿大", "加拿大", "多伦多", "多倫多", "温哥华", "溫哥華", "蒙特利尔", "蒙特利爾", "canada", "toronto", "vancouver", "montreal", "yyz", "yvr", "yul", "ca"],
  ["MX", "墨西哥", "墨西哥", "墨西哥城", "mexico", "mexico city", "mex", "mx"],
  ["BR", "巴西", "巴西", "圣保罗", "聖保羅", "里约", "里約", "brazil", "sao paulo", "rio de janeiro", "gru", "gig", "br"],
  ["AR", "阿根廷", "阿根廷", "布宜诺斯艾利斯", "布宜諾斯艾利斯", "argentina", "buenos aires", "eze", "arg", "ar"],
  ["CL", "智利", "智利", "圣地亚哥", "聖地亞哥", "chile", "santiago", "scl", "cl"],
  ["CO", "哥伦比亚", "哥伦比亚", "哥倫比亞", "波哥大", "colombia", "bogota", "bog", "co"],
  ["PE", "秘鲁", "秘鲁", "秘魯", "利马", "利馬", "peru", "lima", "lim", "pe"],
  ["VE", "委内瑞拉", "委内瑞拉", "委內瑞拉", "加拉加斯", "venezuela", "caracas", "ccs", "ve"],
  ["UY", "乌拉圭", "乌拉圭", "烏拉圭", "蒙得维的亚", "蒙得維的亞", "uruguay", "montevideo", "mvd", "uy"],
  ["PA", "巴拿马", "巴拿马", "巴拿馬", "panama", "panama city", "pty", "pa"],
  ["CR", "哥斯达黎加", "哥斯达黎加", "哥斯達黎加", "圣何塞哥斯达黎加", "costa rica", "san jose costa rica", "sjo", "cr"],
  ["PR", "波多黎各", "波多黎各", "puerto rico", "san juan", "sju", "pr"],
  ["BO", "玻利维亚", "玻利维亚", "玻利維亞", "bolivia", "la paz", "lpb", "bo"],
  ["EC", "厄瓜多尔", "厄瓜多尔", "厄瓜多爾", "ecuador", "quito", "uio", "ec"],
  ["GB", "英国", "英国", "英國", "伦敦", "倫敦", "曼彻斯特", "曼徹斯特", "united kingdom", "great britain", "england", "london", "manchester", "lhr", "lgw", "man", "uk", "gb"],
  ["IE", "爱尔兰", "爱尔兰", "愛爾蘭", "都柏林", "ireland", "dublin", "dub", "ie"],
  ["FR", "法国", "法国", "法國", "巴黎", "马赛", "馬賽", "france", "paris", "marseille", "cdg", "ory", "mrs", "fr"],
  ["DE", "德国", "德国", "德國", "法兰克福", "法蘭克福", "柏林", "慕尼黑", "germany", "frankfurt", "berlin", "munich", "fra", "ber", "muc", "de"],
  ["NL", "荷兰", "荷兰", "荷蘭", "阿姆斯特丹", "鹿特丹", "netherlands", "holland", "amsterdam", "rotterdam", "ams", "rtm", "nl"],
  ["BE", "比利时", "比利时", "比利時", "布鲁塞尔", "布魯塞爾", "belgium", "brussels", "bru", "be"],
  ["LU", "卢森堡", "卢森堡", "盧森堡", "luxembourg", "lux", "lu"],
  ["CH", "瑞士", "瑞士", "苏黎世", "蘇黎世", "日内瓦", "日內瓦", "switzerland", "zurich", "geneva", "zrh", "gva", "ch"],
  ["AT", "奥地利", "奥地利", "奧地利", "维也纳", "維也納", "austria", "vienna", "vie", "at"],
  ["IT", "意大利", "意大利", "義大利", "罗马", "羅馬", "米兰", "米蘭", "italy", "rome", "milan", "fco", "mxp"],
  ["ES", "西班牙", "西班牙", "马德里", "馬德里", "巴塞罗那", "巴塞羅那", "spain", "madrid", "barcelona", "mad", "bcn", "es"],
  ["PT", "葡萄牙", "葡萄牙", "里斯本", "波尔图", "波爾圖", "portugal", "lisbon", "porto", "lis", "opo", "pt"],
  ["DK", "丹麦", "丹麦", "丹麥", "哥本哈根", "denmark", "copenhagen", "cph", "dk"],
  ["SE", "瑞典", "瑞典", "斯德哥尔摩", "斯德哥爾摩", "sweden", "stockholm", "arn", "se"],
  ["NO", "挪威", "挪威", "奥斯陆", "奧斯陸", "norway", "oslo", "osl"],
  ["FI", "芬兰", "芬兰", "芬蘭", "赫尔辛基", "赫爾辛基", "finland", "helsinki", "hel", "fi"],
  ["IS", "冰岛", "冰岛", "冰島", "雷克雅未克", "iceland", "reykjavik", "kef"],
  ["PL", "波兰", "波兰", "波蘭", "华沙", "華沙", "克拉科夫", "poland", "warsaw", "krakow", "waw", "krk", "pl"],
  ["CZ", "捷克", "捷克", "布拉格", "czech", "czechia", "prague", "prg", "cz"],
  ["SK", "斯洛伐克", "斯洛伐克", "布拉迪斯拉发", "布拉迪斯拉發", "slovakia", "bratislava", "bts", "sk"],
  ["HU", "匈牙利", "匈牙利", "布达佩斯", "布達佩斯", "hungary", "budapest", "bud", "hu"],
  ["RO", "罗马尼亚", "罗马尼亚", "羅馬尼亞", "布加勒斯特", "romania", "bucharest", "otp", "ro"],
  ["BG", "保加利亚", "保加利亚", "保加利亞", "索非亚", "索菲亞", "bulgaria", "sofia", "sof", "bg"],
  ["GR", "希腊", "希腊", "希臘", "雅典", "greece", "athens", "ath", "gr"],
  ["HR", "克罗地亚", "克罗地亚", "克羅地亞", "萨格勒布", "薩格勒布", "croatia", "zagreb", "zag", "hr"],
  ["SI", "斯洛文尼亚", "斯洛文尼亚", "斯洛文尼亞", "卢布尔雅那", "盧布爾雅那", "slovenia", "ljubljana", "lju", "si"],
  ["RS", "塞尔维亚", "塞尔维亚", "塞爾維亞", "贝尔格莱德", "貝爾格萊德", "serbia", "belgrade", "beg", "rs"],
  ["BA", "波黑", "波黑", "波斯尼亚", "波斯尼亞", "bosnia", "sarajevo", "sjj", "ba"],
  ["MK", "北马其顿", "北马其顿", "北馬其頓", "macedonia", "north macedonia", "skopje", "skp", "mk"],
  ["AL", "阿尔巴尼亚", "阿尔巴尼亚", "阿爾巴尼亞", "albania", "tirana", "tia", "al"],
  ["ME", "黑山", "黑山", "montenegro", "podgorica", "tgd", "me"],
  ["LT", "立陶宛", "立陶宛", "维尔纽斯", "維爾紐斯", "lithuania", "vilnius", "vno", "lt"],
  ["LV", "拉脱维亚", "拉脱维亚", "拉脫維亞", "里加", "latvia", "riga", "rix", "lv"],
  ["EE", "爱沙尼亚", "爱沙尼亚", "愛沙尼亞", "塔林", "estonia", "tallinn", "tll", "ee"],
  ["UA", "乌克兰", "乌克兰", "烏克蘭", "基辅", "基輔", "ukraine", "kyiv", "kiev", "kbp", "iev", "ua"],
  ["BY", "白俄罗斯", "白俄罗斯", "白俄羅斯", "明斯克", "belarus", "minsk", "msq", "by"],
  ["MD", "摩尔多瓦", "摩尔多瓦", "摩爾多瓦", "moldova", "chisinau", "kiv", "md"],
  ["RU", "俄罗斯", "俄罗斯", "俄羅斯", "莫斯科", "圣彼得堡", "聖彼得堡", "russia", "moscow", "saint petersburg", "svo", "dme", "led", "ru"],
  ["AU", "澳大利亚", "澳大利亚", "澳大利亞", "澳洲", "悉尼", "墨尔本", "墨爾本", "布里斯班", "珀斯", "australia", "sydney", "melbourne", "brisbane", "perth", "syd", "mel", "bne", "per", "au"],
  ["NZ", "新西兰", "新西兰", "新西蘭", "奥克兰", "奧克蘭", "惠灵顿", "惠靈頓", "new zealand", "auckland", "wellington", "akl", "wlg", "nz"],
  ["MY", "马来西亚", "马来西亚", "馬來西亞", "吉隆坡", "槟城", "檳城", "malaysia", "kuala lumpur", "penang", "kul", "pen", "my"],
  ["TH", "泰国", "泰国", "泰國", "曼谷", "清迈", "清邁", "thailand", "bangkok", "chiang mai", "bkk", "cnx", "th"],
  ["VN", "越南", "越南", "河内", "河內", "胡志明", "vietnam", "hanoi", "ho chi minh", "sgn", "han", "vn"],
  ["PH", "菲律宾", "菲律宾", "菲律賓", "马尼拉", "馬尼拉", "宿务", "宿霧", "philippines", "manila", "cebu", "mnl", "ceb", "ph"],
  ["ID", "印度尼西亚", "印度尼西亚", "印度尼西亞", "印尼", "雅加达", "雅加達", "巴厘岛", "峇里島", "indonesia", "jakarta", "bali", "cgk", "dps", "id"],
  ["KH", "柬埔寨", "柬埔寨", "金边", "金邊", "cambodia", "phnom penh", "pnh", "kh"],
  ["LA", "老挝", "老挝", "老撾", "万象", "萬象", "laos", "vientiane", "vte", "la"],
  ["MM", "缅甸", "缅甸", "緬甸", "仰光", "myanmar", "burma", "yangon", "rgn", "mm"],
  ["BN", "文莱", "文莱", "汶萊", "brunei", "bandar seri begawan", "bwn", "bn"],
  ["TL", "东帝汶", "东帝汶", "東帝汶", "timor leste", "dili", "dil", "tl"],
  ["IN", "印度", "印度", "孟买", "孟買", "德里", "班加罗尔", "班加羅爾", "india", "mumbai", "delhi", "bangalore", "bengaluru", "bom", "del", "blr"],
  ["PK", "巴基斯坦", "巴基斯坦", "卡拉奇", "伊斯兰堡", "伊斯蘭堡", "pakistan", "karachi", "islamabad", "khi", "isb", "pk"],
  ["BD", "孟加拉国", "孟加拉国", "孟加拉國", "达卡", "達卡", "bangladesh", "dhaka", "dac", "bd"],
  ["LK", "斯里兰卡", "斯里兰卡", "斯里蘭卡", "科伦坡", "科倫坡", "sri lanka", "colombo", "cmb", "lk"],
  ["NP", "尼泊尔", "尼泊尔", "尼泊爾", "加德满都", "加德滿都", "nepal", "kathmandu", "ktm", "np"],
  ["MN", "蒙古", "蒙古", "乌兰巴托", "烏蘭巴托", "mongolia", "ulaanbaatar", "uln", "mn"],
  ["KZ", "哈萨克斯坦", "哈萨克斯坦", "哈薩克斯坦", "阿拉木图", "阿拉木圖", "阿斯塔纳", "阿斯塔納", "kazakhstan", "almaty", "astana", "ala", "nqz", "kz"],
  ["UZ", "乌兹别克斯坦", "乌兹别克斯坦", "烏茲別克斯坦", "塔什干", "uzbekistan", "tashkent", "tas", "uz"],
  ["KG", "吉尔吉斯斯坦", "吉尔吉斯斯坦", "吉爾吉斯斯坦", "比什凯克", "比什凱克", "kyrgyzstan", "bishkek", "fru", "kg"],
  ["TJ", "塔吉克斯坦", "塔吉克斯坦", "杜尚别", "杜尚別", "tajikistan", "dushanbe", "dyu", "tj"],
  ["TM", "土库曼斯坦", "土库曼斯坦", "土庫曼斯坦", "阿什哈巴德", "turkmenistan", "ashgabat", "asb", "tm"],
  ["AE", "阿联酋", "阿联酋", "阿聯酋", "迪拜", "阿布扎比", "united arab emirates", "uae", "dubai", "abu dhabi", "dxb", "auh", "ae"],
  ["SA", "沙特阿拉伯", "沙特", "沙特阿拉伯", "利雅得", "吉达", "吉達", "saudi arabia", "riyadh", "jeddah", "ruh", "jed", "sa"],
  ["QA", "卡塔尔", "卡塔尔", "卡塔爾", "多哈", "qatar", "doha", "doh", "qa"],
  ["BH", "巴林", "巴林", "麦纳麦", "麥納麥", "bahrain", "manama", "bah", "bh"],
  ["KW", "科威特", "科威特", "kuwait", "kuwait city", "kwi", "kw"],
  ["OM", "阿曼", "阿曼", "马斯喀特", "馬斯喀特", "oman", "muscat", "mct", "om"],
  ["IL", "以色列", "以色列", "特拉维夫", "特拉維夫", "耶路撒冷", "israel", "tel aviv", "jerusalem", "tlv", "il"],
  ["JO", "约旦", "约旦", "約旦", "安曼", "jordan", "amman", "amm", "jo"],
  ["LB", "黎巴嫩", "黎巴嫩", "贝鲁特", "貝魯特", "lebanon", "beirut", "bey", "lb"],
  ["IR", "伊朗", "伊朗", "德黑兰", "德黑蘭", "iran", "tehran", "ika", "thr", "ir"],
  ["IQ", "伊拉克", "伊拉克", "巴格达", "巴格達", "iraq", "baghdad", "bgw", "iq"],
  ["TR", "土耳其", "土耳其", "伊斯坦布尔", "伊斯坦堡", "安卡拉", "turkey", "turkiye", "istanbul", "ankara", "ist", "saw", "esb", "tr"],
  ["CY", "塞浦路斯", "塞浦路斯", "尼科西亚", "尼科西亞", "cyprus", "nicosia", "lca", "cy"],
  ["GE", "格鲁吉亚", "格鲁吉亚", "格魯吉亞", "第比利斯", "georgia", "tbilisi", "tbs", "ge"],
  ["AM", "亚美尼亚", "亚美尼亚", "亞美尼亞", "埃里温", "埃里溫", "armenia", "yerevan", "evn", "am"],
  ["AZ", "阿塞拜疆", "阿塞拜疆", "巴库", "巴庫", "azerbaijan", "baku", "gyd", "az"],
  ["EG", "埃及", "埃及", "开罗", "開羅", "egypt", "cairo", "cai", "eg"],
  ["ZA", "南非", "南非", "约翰内斯堡", "約翰內斯堡", "开普敦", "開普敦", "south africa", "johannesburg", "cape town", "jnb", "cpt", "za"],
  ["NG", "尼日利亚", "尼日利亚", "尼日利亞", "拉各斯", "nigeria", "lagos", "los", "ng"],
  ["KE", "肯尼亚", "肯尼亚", "肯尼亞", "内罗毕", "內羅畢", "kenya", "nairobi", "nbo", "ke"],
  ["MA", "摩洛哥", "摩洛哥", "卡萨布兰卡", "卡薩布蘭卡", "morocco", "casablanca", "cmn", "ma"],
  ["TN", "突尼斯", "突尼斯", "tunisia", "tunis", "tun", "tn"],
  ["DZ", "阿尔及利亚", "阿尔及利亚", "阿爾及利亞", "阿尔及尔", "阿爾及爾", "algeria", "algiers", "alg", "dz"],
  ["GH", "加纳", "加纳", "迦納", "阿克拉", "ghana", "accra", "acc", "gh"],
  ["ET", "埃塞俄比亚", "埃塞俄比亚", "埃塞俄比亞", "亚的斯亚贝巴", "亞的斯亞貝巴", "ethiopia", "addis ababa", "add", "et"],
];

function normalizeRegionText(value) {
  let text = String(value || "");
  if (LATIN_DIACRITIC_RE.test(text)) {
    text = text.normalize("NFD").replace(COMBINING_MARK_RE, "");
  }
  return text
    .replace(/[()\[\]{}<>]/g, " ")
    .replace(/[_\-|｜/\\:：,，.;；]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// 一套预编译索引同时供地区识别和机场名清理使用。
function buildRegionIndexes() {
  const data = Object.create(null);
  const tokenIndex = new Map();
  for (const [code, name, ...aliases] of REGION_ROWS) {
    data[code] = { code, name, flag: ccToFlag(code) };
    for (const alias of aliases) {
      const normalized = normalizeRegionText(alias);
      if (normalized && !tokenIndex.has(normalized)) tokenIndex.set(normalized, code);
    }
  }
  const exactAliases = new Set(tokenIndex.keys());
  const aliases = [...exactAliases]
    .filter((alias) => !/^[a-z0-9]{2,3}$/.test(alias))
    .sort((a, b) => b.length - a.length);
  const escape = (alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const latin = aliases
    .filter((alias) => /[a-z]/.test(alias))
    .map(escape)
    .join("|");
  const other = aliases
    .filter((alias) => !/[a-z]/.test(alias))
    .map(escape)
    .join("|");
  const aliasRegex = new RegExp(`(?:^|[^a-z])(${latin})(?=$|[^a-z])|(${other})`, "g");
  return { data, tokenIndex, exactAliases, aliasRegex };
}

const REGION_INDEX = buildRegionIndexes();
const REGION_DATA = REGION_INDEX.data;
const REGION_TOKEN_INDEX = REGION_INDEX.tokenIndex;
const REGION_EXACT_ALIASES = REGION_INDEX.exactAliases;

function operator(proxies = []) {
  const args = typeof $arguments === "object" && $arguments ? $arguments : {};
  const source = Array.isArray(proxies) ? proxies : [];

  const modeValue = String(args.mode || "prefix")
    .trim()
    .toLowerCase();
  const mode = MODE_VALUES.has(modeValue) ? modeValue : "prefix";
  const options = {
    dropInfo: argBool(args.drop_info, true),
    mode,
    showLine: argBool(args.show_line, true),
    showTier: argBool(args.show_tier, true),
    showRoute: argBool(args.show_route, true),
    showIpType: argBool(args.show_ip_type, true),
    showFeature: argBool(args.show_feature, true),
    showExtra: argBool(args.show_extra, true),
    showRate: argBool(args.show_rate, true),
    dedupe: argBool(args.dedupe, true),
    keepUnknown: argBool(args.keep_unknown, true),
    useMetadata: argBool(args.use_metadata, true),
    showFlag: argBool(args.show_flag, true),
    showProvider: argBool(args.show_provider, true),
    showRegion: argBool(args.show_region, true),
    showSeq: argBool(args.show_seq, true),
    provider: normalizeProviderName(args.provider || ""),
    maxTags: numberArg(args.max_tags ?? args.max_line_tags, 24, 0, 32),
    customTags: parseCustomTags(args.custom_tags),
    seqWidth: numberArg(args.seq_width, 2, 1, 4),
    separator: separatorArg(args.separator, "|"),
    nameLength: numberArg(args.name_len, 95, 32, 256),
    debug: argBool(args.debug, false),
  };
  const startedAt = options.debug ? Date.now() : 0;

  /*
   * 完全透传是最常见的“临时关闭脚本”场景。这里直接返回原数组，
   * 避免无意义的分配、分类和 Map 初始化。
   */
  if (options.mode === "off" && !options.dropInfo && options.keepUnknown && !options.debug) {
    return source;
  }

  const references = captureProxyReferences(source);
  const counters = new Map();
  const regionCache = new Map();
  const providerCache = new Map();
  const output = [];
  const stats = options.debug
    ? {
        input: source.length,
        hardInfo: 0,
        softInfo: 0,
        unknown: 0,
        metadata: 0,
        renamed: 0,
        startedAt,
      }
    : null;

  const getRegion = (name) => {
    const cached = regionCache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const region = detectRegion(name);
    regionCache.set(name, region);
    return region;
  };

  for (const proxy of source) {
    if (!proxy || typeof proxy !== "object") {
      output.push(proxy);
      continue;
    }

    const oldName = String(proxy?.name || "").trim();
    const infoKind = options.dropInfo ? classifyInfoNode(oldName) : 0;

    // 明确的流量、到期伪节点不需要再做地区识别。
    if (infoKind === 2) {
      if (stats) {
        stats.hardInfo++;
      }
      continue;
    }

    const needsRegion = infoKind === 1 || !options.keepUnknown || options.mode !== "off";
    let region = needsRegion ? getRegion(oldName) : UNKNOWN_REGION;
    if (needsRegion && options.useMetadata && region.code === "OT") {
      const metadataRegion = regionFromMetadata(proxy);
      if (metadataRegion.code !== "OT") {
        region = metadataRegion;
        if (stats) {
          stats.metadata++;
        }
      }
    }

    // “订阅/通知”等软关键词只有在没有明确地区时才视作伪节点。
    if (infoKind === 1 && region.code === "OT") {
      if (stats) {
        stats.softInfo++;
      }
      continue;
    }
    if (!options.keepUnknown && region.code === "OT") {
      if (stats) {
        stats.unknown++;
      }
      continue;
    }

    // off 表示真正不修改节点名，也无需计算机场名、序号和标签。
    if (options.mode === "off") {
      output.push(proxy);
      continue;
    }

    const tagMatches =
      options.showLine && options.maxTags > 0
        ? collectTagMatches(oldName, options.customTags)
        : null;
    const needsProvider = options.showProvider || (options.showRegion && options.showSeq);
    const provider = needsProvider
      ? providerFromNode(proxy, options.provider, providerCache, tagMatches, options.customTags)
      : "";

    let regionLabel = "";
    if (options.showRegion) {
      if (options.showSeq) {
        const counterKey = `${provider}\u0000${region.code}`;
        const sequence = (counters.get(counterKey) || 0) + 1;
        counters.set(counterKey, sequence);
        regionLabel = `${region.name}${padNumber(sequence, options.seqWidth)}`;
      } else {
        regionLabel = region.name;
      }
    }

    const tag = buildName(
      {
        flag: options.showFlag ? region.flag : "",
        provider: options.showProvider ? provider : "",
        regionLabel,
        lineTags: options.showLine ? detectTags(tagMatches || [], options) : [],
        rate: options.showRate ? detectRate(oldName, proxy) : "",
      },
      options,
    );

    proxy.name = applyMode(oldName, tag, options.mode, options.nameLength);
    output.push(proxy);
    if (stats) {
      stats.renamed++;
    }
  }

  if (options.dedupe && options.mode !== "off") {
    dedupeNames(output, options.nameLength);
  }
  updateProxyReferences(output, references);
  if (stats) {
    logStats(stats, output.length);
  }

  return output;
}

function argBool(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return /^(1|true|yes|y|on)$/i.test(String(value).trim());
}

function numberArg(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function separatorArg(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const separator = truncateText(String(value).replace(/[\u0000-\u001f\u007f]/g, ""), 4);
  return separator || fallback;
}

function padNumber(number, width) {
  return String(number).padStart(width, "0");
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  let result = text.slice(0, maxLength);
  const lastCode = result.charCodeAt(result.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    result = result.slice(0, -1);
  }
  return result;
}

function buildName(data, options) {
  const separator = options.separator;
  const tail = data.rate ? [data.rate] : [];
  // 优先为地区和倍率预留空间；机场名过长时单独截短。
  const required = [data.flag, data.regionLabel, ...tail].filter(Boolean);
  const available =
    options.nameLength - required.join(separator).length - (required.length ? separator.length : 0);
  const provider = truncateText(data.provider, Math.max(0, available));
  const head = [data.flag, provider, data.regionLabel].filter(Boolean);
  const selected = [];
  let length = head.join(separator).length;
  const tailLength = tail.join(separator).length;

  // 先选重要标签，再恢复其在原名中的顺序。长度限制不会吞掉靠后的等级。
  const candidates = data.lineTags
    .slice()
    .sort((a, b) => TAG_PRIORITY[a.category] - TAG_PRIORITY[b.category] || a.start - b.start);
  for (const candidate of candidates) {
    if (selected.length >= options.maxTags) {
      break;
    }
    const addedLength =
      candidate.label.length + (head.length + selected.length ? separator.length : 0);
    const candidateLength =
      length + addedLength + (tail.length ? separator.length + tailLength : 0);
    if (candidateLength <= options.nameLength) {
      selected.push(candidate);
      length += addedLength;
    }
  }
  selected.sort((a, b) => a.start - b.start);
  const fields = head.concat(
    selected.map((item) => item.label),
    tail,
  );
  return truncateText(fields.join(separator), options.nameLength);
}

function applyMode(oldName, tag, mode, nameLength) {
  if (!tag || mode === "off") {
    return oldName;
  }
  if (mode === "suffix") {
    const old = String(oldName || "");
    if (old === tag) return truncateText(tag, nameLength);
    const prefix = old.endsWith(` ${tag}`) ? old.slice(0, -tag.length - 1) : old;
    const available = nameLength - tag.length - 1;
    return available > 0
      ? `${truncateText(prefix, available).trim()} ${tag}`.trim()
      : truncateText(tag, nameLength);
  }
  return truncateText(tag, nameLength);
}

function normalizeProviderName(value, maxLength = 24) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  return truncateText(
    raw
      .replace(/[⏳✅❌⭐️]/g, "")
      .replace(FLAG_ALL_RE, "")
      .replace(GENERIC_REGION_ICON_RE, "")
      .replace(/[｜|]/g, " ")
      .replace(/[【】()[\]（）{}〈〉]/g, " ")
      .replace(/^[\s|\-_/\\]+|[\s|\-_/\\]+$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    maxLength,
  );
}

function providerCandidateFromPart(value) {
  const part = normalizeProviderName(value, 256)
    .replace(RATE_RE, " ")
    .replace(/(?:线路|線路|节点|節點|\b(?:node|server|vps)\b)\s*\d{0,3}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!part) {
    return "";
  }

  const tokens = part.split(/\s+/);
  const normalizedTokens = new Array(tokens.length);
  const regionTokens = new Array(tokens.length).fill(false);
  for (let index = 0; index < tokens.length; index++) {
    normalizedTokens[index] = normalizeRegionText(tokens[index]);
  }

  /*
   * 标记一至五词的地区短语，例如 Hong Kong、Los Angeles、
   * United Arab Emirates。优先取最长短语，避免 San Jose 抢先命中。
   */
  for (let start = 0; start < normalizedTokens.length; start++) {
    let bestEnd = -1;
    let rawPhrase = "";
    const last = Math.min(normalizedTokens.length, start + 5);
    for (let end = start + 1; end <= last; end++) {
      rawPhrase += `${end === start + 1 ? "" : " "}${normalizedTokens[end - 1]}`;
      const lastCode = rawPhrase.charCodeAt(rawPhrase.length - 1);
      const phrase =
        lastCode >= 48 && lastCode <= 57 ? rawPhrase.replace(/\d{1,3}$/, "").trim() : rawPhrase;
      if (
        REGION_EXACT_ALIASES.has(phrase) ||
        (end === start + 1 &&
          (regionCodeFromToken(rawPhrase) ||
            (/^[A-Z]{2}$/.test(tokens[start]) && REGION_DATA[tokens[start]])))
      ) {
        bestEnd = end;
      }
    }
    if (bestEnd > start) {
      for (let index = start; index < bestEnd; index++) {
        regionTokens[index] = true;
      }
      start = bestEnd - 1;
    }
  }

  const providerTokens = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (
      regionTokens[index] ||
      /^\d{1,3}$/.test(token) ||
      /^v\d+(?:\.\d+)*$/i.test(token) ||
      /^\d+(?:\.\d+)?(?:ms|kbps|mbps|gbps)$/i.test(token) ||
      PROTOCOL_NAME_RE.test(token) ||
      looksLikeUsage(token) ||
      looksLikeExpire(token) ||
      detectRate(token)
    ) {
      continue;
    }
    providerTokens.push(token);
  }
  return normalizeProviderName(providerTokens.join(" "));
}

function providerFromNode(proxy, manualProvider, cache, tagMatches, customTags) {
  if (manualProvider) {
    return manualProvider;
  }

  let rawSubscription = "";
  for (const key of PROVIDER_METADATA_KEYS) {
    const value = proxy?.[key];
    if (value !== undefined && value !== null && value !== "") {
      rawSubscription = String(value);
      break;
    }
  }

  if (rawSubscription) {
    const cached = cache.get(rawSubscription);
    if (cached !== undefined) {
      return cached;
    }
    const normalized = normalizeProviderName(rawSubscription) || "UNKNOWN";
    cache.set(rawSubscription, normalized);
    return normalized;
  }

  const oldName = String(proxy?.name || "");
  const matches = tagMatches || collectTagMatches(oldName, customTags);
  let cleanName = oldName;
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index];
    cleanName = `${cleanName.slice(0, match.start)} ${cleanName.slice(match.end)}`;
  }
  const parts = cleanName.split(/[|｜\-_/\\]+/);

  for (const rawPart of parts) {
    const part = providerCandidateFromPart(rawPart);
    if (!part) {
      continue;
    }
    return part.slice(0, 24);
  }
  return "UNKNOWN";
}

function looksLikeUsage(value) {
  return USAGE_RE.test(String(value || ""));
}

function looksLikeExpire(value) {
  const text = String(value || "");
  return EXPIRE_RE.test(text) && !looksLikeUsage(text);
}

/*
 * 返回值：
 * 0 = 普通节点
 * 1 = 含通知/订阅类软关键词，需要结合地区判断
 * 2 = 明确的流量/到期伪节点，可以直接删除
 */
function classifyInfoNode(name) {
  const text = String(name || "").trim();
  if (
    INFO_HARD_RE.test(text) ||
    INFO_TRAFFIC_ONLY_RE.test(text) ||
    INFO_EXPIRE_ONLY_RE.test(text)
  ) {
    return 2;
  }
  return INFO_SOFT_ZH_RE.test(text) || INFO_SOFT_EN_RE.test(text) ? 1 : 0;
}

function detectRegion(name) {
  const raw = String(name || "");

  const flagCode = flagToCC(raw);
  if (flagCode) {
    return regionFromCC(flagCode);
  }

  const explicitCode = findExplicitCountryCode(raw);
  if (explicitCode) {
    return regionFromCC(explicitCode);
  }

  const normalized = normalizeRegionText(removeFlags(raw));
  if (!normalized) {
    return UNKNOWN_REGION;
  }
  // 长名称先于短代码，避免 Korea / 俄罗斯抢先命中完整国家名称。
  const aliasCode = matchRegionAlias(normalized);
  if (aliasCode) return regionFromCC(aliasCode);
  for (const token of normalized.split(" ")) {
    const code = regionCodeFromToken(token);
    if (code) return regionFromCC(code);
  }

  if (GLOBAL_REGION_RE.test(normalized) || GLOBAL_REGION_RE.test(raw)) {
    return GLOBAL_REGION;
  }
  return UNKNOWN_REGION;
}

function regionCodeFromToken(token) {
  const exactCode = REGION_TOKEN_INDEX.get(token);
  if (exactCode) {
    return exactCode;
  }

  const match = NUMBERED_TOKEN_RE.exec(token);
  if (!match) {
    return "";
  }

  const stem = match[1];
  const sequence = match[2];

  // CN2 是线路类型，不是“中国 2 号”。
  if (stem === "cn" && sequence === "2") {
    return "";
  }

  const aliasCode = REGION_TOKEN_INDEX.get(stem);
  if (aliasCode) {
    return aliasCode;
  }
  if (stem.length === 2) {
    const isoCode = stem.toUpperCase();
    return REGION_DATA[isoCode] ? isoCode : "";
  }
  return "";
}

function matchRegionAlias(text) {
  const regex = REGION_INDEX.aliasRegex;
  regex.lastIndex = 0;
  let best = "";
  let match;
  while ((match = regex.exec(text))) {
    const alias = match[1] || match[2];
    if (alias.length > best.length) best = alias;
  }
  return REGION_TOKEN_INDEX.get(best) || "";
}

function removeFlags(value) {
  return String(value || "").replace(FLAG_ALL_RE, "");
}

function findExplicitCountryCode(raw) {
  const parts = removeFlags(raw).split(REGION_PART_SPLIT_RE);

  for (const part of parts) {
    if (/^[A-Z]{2}$/.test(part) && REGION_DATA[part]) {
      return part;
    }

    const numbered = NUMBERED_TOKEN_RE.exec(part.toLowerCase());
    if (!numbered || numbered[1].length !== 2) {
      continue;
    }
    if (numbered[1] === "cn" && numbered[2] === "2") {
      continue;
    }
    const code = numbered[1].toUpperCase();
    if (REGION_DATA[code]) {
      return code;
    }
  }
  return "";
}

function regionFromMetadata(proxy) {
  for (const key of REGION_METADATA_KEYS) {
    const value = proxy?.[key];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const code = value.trim().toUpperCase();
    const region = REGION_DATA[code] || detectRegion(value);
    if (region.code !== "OT") {
      return region;
    }
  }
  return UNKNOWN_REGION;
}

function regionFromCC(cc) {
  const code = String(cc || "").toUpperCase();
  if (REGION_DATA[code]) {
    return REGION_DATA[code];
  }
  if (/^[A-Z]{2}$/.test(code)) {
    return {
      code,
      name: code,
      flag: ccToFlag(code),
    };
  }
  return UNKNOWN_REGION;
}

function ccToFlag(cc) {
  const code = String(cc || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return "🏳️";
  }
  return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);
}

function flagToCC(text) {
  const match = FLAG_PAIR_RE.exec(String(text || ""));
  if (!match) {
    return "";
  }
  const first = match[0].codePointAt(0);
  const second = match[0].codePointAt(2);
  return String.fromCharCode(65 + first - 0x1f1e6) + String.fromCharCode(65 + second - 0x1f1e6);
}

function parseCustomTags(value) {
  const result = [];
  const seen = new Set();
  for (const item of String(value || "").split(/[,，;；]/)) {
    const tag = truncateText(item.trim(), 24);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
      if (result.length >= 20) {
        break;
      }
    }
  }
  return result.sort((a, b) => b.length - a.length);
}

function validExtraLabel(value) {
  const label = String(value || "").trim();
  if (
    label.length < 2 ||
    label.length > 16 ||
    !/^[A-Za-z0-9\u00c0-\u024f\u3400-\u9fff][A-Za-z0-9\u00c0-\u024f\u3400-\u9fff +_.-]*$/.test(
      label,
    ) ||
    !/[A-Za-z\u00c0-\u024f\u3400-\u9fff]/.test(label) ||
    RATE_RE.test(label) ||
    PROTOCOL_NAME_RE.test(label) ||
    looksLikeUsage(label) ||
    looksLikeExpire(label) ||
    /^v\d+(?:\.\d+)*$/i.test(label) ||
    /\d+(?:\.\d+)?\s*(?:ms|kbps|mbps|gbps)\b/i.test(label) ||
    /^(?:节点|節點|node|server|vps)\s*\d*$/i.test(label)
  ) {
    return false;
  }
  const normalized = normalizeRegionText(label).replace(/\d{1,3}$/, "");
  return (
    !REGION_EXACT_ALIASES.has(normalized) &&
    !regionCodeFromToken(normalized) &&
    !GLOBAL_REGION_RE.test(label)
  );
}

function collectTagMatches(name, customTags = []) {
  const text = String(name || "");
  const matches = [];
  const overlaps = (start, end) => matches.some((match) => start < match.end && end > match.start);

  // 自定义复合词优先，允许把“静态住宅”保留为一个完整标签。
  if (customTags.length) {
    const lower = text.toLowerCase();
    for (const label of customTags) {
      const term = label.toLowerCase();
      let start = lower.indexOf(term);
      while (start !== -1) {
        const end = start + term.length;
        const asciiFirst = /[a-z0-9]/i.test(term[0]);
        const asciiLast = /[a-z0-9]/i.test(term[term.length - 1]);
        const leftOk = !asciiFirst || start === 0 || !/[a-z0-9]/i.test(lower[start - 1]);
        const rightOk = !asciiLast || end === lower.length || !/[a-z0-9]/i.test(lower[end]);
        if (leftOk && rightOk && !overlaps(start, end)) {
          matches.push({ start, end, label, category: "custom" });
        }
        start = lower.indexOf(term, end);
      }
    }
  }
  let searchable = text;
  if (matches.length) {
    const chars = text.split("");
    for (const { start, end } of matches) {
      chars.fill(" ", start, end);
    }
    searchable = chars.join("");
  }
  TAG_MASTER_RE.lastIndex = 0;
  let match;
  while ((match = TAG_MASTER_RE.exec(searchable))) {
    for (let index = 0; index < TAG_RULES.length; index++) {
      if (match[index + 1] !== undefined) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          label: TAG_RULES[index][1],
          category: TAG_RULES[index][2],
        });
        break;
      }
    }
  }
  EXTRA_FIELD_RE.lastIndex = 0;
  while ((match = EXTRA_FIELD_RE.exec(text))) {
    const label = match[2];
    if (validExtraLabel(label) && !overlaps(match.index, match.index + match[0].length)) {
      const category = /^(?:等级|等級|级别|級別|档位|檔位|套餐|计划|計劃|版型)$/.test(match[1])
        ? "tier"
        : /^(?:线路|線路)$/.test(match[1])
          ? "route"
          : "extra";
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        label,
        category,
        inferred: true,
      });
    }
  }
  EXTRA_BRACKET_RE.lastIndex = 0;
  while ((match = EXTRA_BRACKET_RE.exec(text))) {
    const label = (match[1] || match[2] || match[3] || match[4]).trim();
    const prefix = removeFlags(text.slice(0, match.index)).trim();
    if (prefix && validExtraLabel(label) && !overlaps(match.index, match.index + match[0].length)) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        label,
        category: "extra",
        inferred: true,
      });
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  return matches;
}

function detectTags(matches, options) {
  if (options.maxTags <= 0) {
    return [];
  }
  const enabled = {
    route: options.showRoute,
    tier: options.showTier,
    ip: options.showIpType,
    feature: options.showFeature,
    custom: true,
    extra: options.showExtra,
  };
  const labels = [];
  const seen = new Set();
  for (const match of matches) {
    if (
      !enabled[match.category] ||
      (match.inferred && !options.showExtra) ||
      seen.has(match.label)
    ) {
      continue;
    }
    seen.add(match.label);
    labels.push(match);
  }
  return labels;
}

function detectRate(name, proxy) {
  const text = String(name || "");
  const match = RATE_RE.exec(text);
  const metadata = proxy?._multiplier ?? proxy?._rate ?? proxy?.multiplier;
  const rate = Number(match ? match[1] || match[2] || match[3] : metadata);
  return Number.isFinite(rate) && rate > 0 && rate <= 1000 ? `${rate}x` : "";
}

// 名称引用绑定到节点对象，去重完成后再写回最终名称。
function captureProxyReferences(proxies) {
  const byName = new Map();
  const duplicates = new Set();
  for (const proxy of proxies) {
    if (!proxy || typeof proxy.name !== "string") continue;
    if (byName.has(proxy.name)) duplicates.add(proxy.name);
    byName.set(proxy.name, proxy);
  }
  const references = [];
  for (const proxy of proxies) {
    for (const key of ["dialer-proxy", "underlying-proxy"]) {
      const name = proxy?.[key];
      if (!byName.has(name)) continue; // 外部策略组由最终配置负责。
      if (duplicates.has(name)) throw new Error(`[重命名] 前置节点名称不唯一：${name}`);
      references.push({ proxy, key, target: byName.get(name) });
    }
  }
  return references;
}

function updateProxyReferences(proxies, references) {
  const retained = new Set(proxies);
  for (const { proxy, key, target } of references) {
    if (!retained.has(proxy)) continue;
    if (!retained.has(target)) throw new Error(`[重命名] 引用的前置节点被过滤：${target.name}`);
    proxy[key] = target.name;
  }
}

function dedupeNames(proxies, nameLength) {
  const used = new Set();
  const counters = new Map();

  for (const proxy of proxies) {
    if (!proxy || typeof proxy !== "object") {
      continue;
    }

    const base = truncateText(proxy?.name || "", nameLength);
    if (!used.has(base)) {
      used.add(base);
      counters.set(base, 1);
      proxy.name = base;
      continue;
    }

    let count = counters.get(base) || 1;
    let candidate = "";
    do {
      count++;
      const suffix = `#${count}`;
      candidate = `${truncateText(base, Math.max(0, nameLength - suffix.length))}${suffix}`;
    } while (used.has(candidate));

    counters.set(base, count);
    used.add(candidate);
    proxy.name = candidate;
  }
}

function logStats(stats, outputCount) {
  if (typeof console === "undefined" || !console.log) {
    return;
  }
  const elapsed = Date.now() - stats.startedAt;
  const filtered = stats.input - outputCount;
  console.log(
    `[CloudRename v${SCRIPT_VERSION}] ` +
      `input=${stats.input} output=${outputCount} filtered=${filtered} ` +
      `hard_info=${stats.hardInfo} soft_info=${stats.softInfo} ` +
      `unknown=${stats.unknown} metadata=${stats.metadata} ` +
      `renamed=${stats.renamed} elapsed=${elapsed}ms`,
  );
}
