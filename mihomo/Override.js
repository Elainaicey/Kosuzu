/**
 * Kosuzu · Mihomo 配置覆写
 *
 * 执行顺序：上游分流 → Emby 补充 → 自定义策略与地区 → 自定义 DNS。
 * DNS 来源：mihomo/src/dns.yaml；不受 fakeip、ipv6 参数影响。
 * 重新生成：python scripts/build-override.py
 *
 * 上游：https://github.com/powerfullz/override-rules
 * 授权：vendor/powerfullz/LICENSE
 */
"use strict";

// -----------------------------------------------------------------------------
// 配置入口
// -----------------------------------------------------------------------------

function main(config) {
  const result = applyCloudOverrides(powerfullzOverrideMain(config));
  applyKosuzuPolicies(result);
  result.dns = createCustomDns();
  return result;
}

// -----------------------------------------------------------------------------
// 自定义 DNS · mihomo/src/dns.yaml
// -----------------------------------------------------------------------------

// 每次创建独立对象，完整替换上游 DNS。
function createCustomDns() {
  return {
    // 基础设置
    enable: true,
    "cache-algorithm": "arc",
    ipv6: false,
    "prefer-h3": false,
    "respect-rules": true,

    // Fake IP 模式
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter-mode": "blacklist",

    // 本地 Hosts
    "use-hosts": true,
    "use-system-hosts": true,

    // 返回真实 IP 的域名
    "fake-ip-filter": [
      "+.lan",
      "+.local",
      "+.arpa",
      "localhost.ptlogin2.qq.com",
      "+.msftconnecttest.com",
      "+.msftncsi.com",
      "time.*.com",
      "ntp.*.com",
      "+.ntp.org"
    ],

    // 解析 DNS 服务器自身的域名
    "default-nameserver": [
      "tls://223.5.5.5",
      "tls://223.6.6.6"
    ],

    // 代理节点域名：直连解析，避免循环依赖
    "proxy-server-nameserver": [
      "https://dns.alidns.com/dns-query#DIRECT",
      "https://doh.pub/dns-query#DIRECT"
    ],

    // 默认解析：连接遵守分流规则
    nameserver: [
      "https://cloudflare-dns.com/dns-query",
      "https://dns.google/dns-query"
    ],

    // 直连域名：使用国内加密 DNS
    "direct-nameserver": [
      "https://dns.alidns.com/dns-query#DIRECT",
      "https://doh.pub/dns-query#DIRECT"
    ],
    "direct-nameserver-follow-policy": false,

    // 国内域名优先使用国内 DNS
    "nameserver-policy": {
      "geosite:cn": [
        "https://dns.alidns.com/dns-query#DIRECT",
        "https://doh.pub/dns-query#DIRECT"
      ]
    }
  };
}

// -----------------------------------------------------------------------------
// Emby 分组与规则 · mihomo/src/Emby.js
// -----------------------------------------------------------------------------

function applyCloudOverrides(config) {
  if (!config || typeof config !== "object") {
    config = {};
  }

  if (!Array.isArray(config["proxy-groups"])) {
    config["proxy-groups"] = [];
  }

  if (!Array.isArray(config.rules)) {
    config.rules = [];
  }

  if (
    !config["rule-providers"] ||
    typeof config["rule-providers"] !== "object"
  ) {
    config["rule-providers"] = {};
  }

  const groups = config["proxy-groups"];
  const rules = config.rules;
  const providers = config["rule-providers"];

  const groupNames = new Set(
    groups
    .map((group) => group && group.name)
    .filter(Boolean)
    .map(String)
  );

  const availableTargets = new Set([
    "DIRECT",
    "REJECT",
    "REJECT-DROP",
    "PASS",
    "GLOBAL",
    ...groupNames,
  ]);

  const candidates = [
    "选择代理",
    "自动选择",
    "故障转移",
    "香港节点",
    "台湾节点",
    "新加坡节点",
    "日本节点",
    "韩国节点",
    "美国节点",
    "低倍率节点",
    "手动选择",
    "DIRECT",
  ];

  const embyTargets = [...new Set(candidates)].filter((name) =>
    availableTargets.has(name)
  );

  if (embyTargets.length === 0) {
    embyTargets.push("DIRECT");
  }

  if (!groupNames.has("Emby服")) {
    groups.push({
      name: "Emby服",
      type: "select",
      icon: "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/" +
        "IconSet/Color/Emby.png",
      proxies: embyTargets,
    });
  }

  providers.SUPPLEMENT_Emby = {
    type: "http",
    behavior: "domain",
    format: "mrs",
    interval: 86400,
    url: "https://github.com/666OS/rules/raw/release/" +
      "mihomo/domain/Emby.mrs",
    path: "./ruleset/supplement/Emby.mrs",
  };

  providers.SUPPLEMENT_EmbyIP = {
    type: "http",
    behavior: "ipcidr",
    format: "mrs",
    interval: 86400,
    url: "https://github.com/666OS/rules/raw/release/" +
      "mihomo/ip/Emby.mrs",
    path: "./ruleset/supplement/EmbyIP.mrs",
  };

  const embyRules = [
    "RULE-SET,SUPPLEMENT_Emby,Emby服",
    "RULE-SET,SUPPLEMENT_EmbyIP,Emby服,no-resolve",
  ];

  const newRules = embyRules.filter((rule) => !rules.includes(rule));

  if (newRules.length > 0) {
    let insertIndex = rules.findIndex((rule) =>
      /^(RULE-SET,GFWList,|GEOIP,cn,|MATCH,)/i.test(String(rule))
    );

    if (insertIndex < 0) {
      insertIndex = rules.length;
    }

    rules.splice(insertIndex, 0, ...newRules);
  }

  const globalGroup = groups.find(
    (group) => group && group.name === "GLOBAL"
  );

  if (globalGroup) {
    if (!Array.isArray(globalGroup.proxies)) {
      globalGroup.proxies = [];
    }

    if (!globalGroup.proxies.includes("Emby服")) {
      globalGroup.proxies.push("Emby服");
    }
  }

  return config;
}

// -----------------------------------------------------------------------------
// 自定义策略与国家识别 · mihomo/src/Policies.js、Regions.js
// -----------------------------------------------------------------------------

/** Kosuzu 的策略组、候选出口和规则顺序；上游快照保持独立。 */
function applyKosuzuPolicies(config) {
  const args = typeof $arguments === "object" && $arguments ? $arguments : {};
  const replacements = new Map([
    ["静态资源", "选择代理"],
    ["金融服务", "选择代理"],
    ["哔哩哔哩", "DIRECT"],
    ["Truth Social", "选择代理"],
    ["搜狗输入法", "DIRECT"],
    ["PikPak网盘", "选择代理"],
    ["E-Hentai", "选择代理"],
    ["新浪微博", "DIRECT"],
    ["自动选择", "选择代理"],
    ["故障转移", "选择代理"],
  ]);
  const regions = createKosuzuRegionGroups(config, args);
  const regionNames = regions.map((group) => group.name);
  const oldRegions = new Set(config["proxy-groups"]
    .filter((group) => group.name.endsWith("节点") && !["落地节点", "低倍率节点"].includes(group.name))
    .map((group) => group.name));
  const groups = config["proxy-groups"].filter((group) =>
    !replacements.has(group.name) && !oldRegions.has(group.name));
  groups.push(...regions);

  const extraGroups = [
    ["PayPal", "PayPal"],
    ["游戏平台", "Game"],
    ["Meta", "Facebook"],
    ["Discord", "Discord"],
  ];
  for (const [name, icon] of extraGroups) {
    groups.push({
      name,
      type: "select",
      icon: `https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/${icon}.png`,
      proxies: [],
    });
  }

  const groupNames = new Set(groups.map((group) => group.name));
  const unique = (items) => [...new Set(items.filter(Boolean))];
  const extraExits = ["落地节点", "低倍率节点"].filter((name) => groupNames.has(name));
  const businessExits = unique(["选择代理", ...regionNames, ...extraExits, "手动选择", "DIRECT"]);
  const nodeNames = unique(config.proxies.map((node) => node.name));
  const specialGroups = new Set([
    ...regionNames, "选择代理", "手动选择", "Final", "GLOBAL",
    "广告拦截", "前置代理", "落地节点", "低倍率节点", "Tailscale",
  ]);
  for (const group of groups) {
    if (group.name === "选择代理") {
      group.proxies = unique([...extraExits.filter((name) => name === "落地节点"),
        ...regionNames, ...extraExits, "手动选择", "DIRECT"
      ]);
    } else if (group.name === "Final") {
      // 不引入业务组或 GLOBAL，避免形成相互引用；可直接选任意单节点。
      group.proxies = unique([...businessExits, ...nodeNames]);
    } else if (group.name === "前置代理") {
      const frontNodes = config.proxies.filter((node) => node["dialer-proxy"] !== "前置代理");
      group.proxies = unique([...regionNames, "DIRECT", ...frontNodes.map((node) => node.name)]);
    } else if (!specialGroups.has(group.name)) {
      const first = group.proxies?.[0];
      group.proxies = unique([businessExits.includes(first) ? first : null, ...businessExits]);
    }
    if (Array.isArray(group.proxies)) {
      group.proxies = unique(group.proxies.map((name) => replacements.get(name) || name))
        .filter((name) => name !== group.name &&
          (!oldRegions.has(name) || groupNames.has(name)));
      if (group.proxies.length === 0) group.proxies = ["DIRECT"];
    }
  }

  // 少量常用业务与常用国家靠前；其余业务、地区、辅助组依次排列。
  const commonRegions = regionNames.filter((name) => ["香港节点", "台湾节点", "新加坡节点", "日本节点", "韩国节点",
    "美国节点"
  ].includes(name));
  const order = [
    "选择代理", "Final", "AI服务", "Emby服", ...commonRegions,
    "Youtube", "Netflix", "Twitch", "Spotify", "TikTok", "巴哈姆特",
    "Telegram", "Discord", "Meta", "Twitter", "Github",
    "PayPal", "加密货币", "游戏平台", "Xbox", "谷歌服务", "微软服务", "苹果服务",
    ...regionNames.filter((name) => !commonRegions.includes(name)),
    "手动选择", "落地节点", "前置代理", "低倍率节点", "Tailscale", "广告拦截", "GLOBAL",
  ];
  const rank = new Map(order.map((name, index) => [name, index]));
  groups.sort((a, b) => (rank.get(a.name) ?? 999) - (rank.get(b.name) ?? 999));
  const globalGroup = groups.find((group) => group.name === "GLOBAL");
  if (globalGroup) globalGroup.proxies = unique([
    ...groups.filter((group) => group !== globalGroup).map((group) => group.name), "DIRECT",
  ]);
  config["proxy-groups"] = groups;

  const cdnRules = [];
  let rules = config.rules.map((rule) => {
    const parts = rule.split(",");
    const targetIndex = parts.length - (parts[parts.length - 1] === "no-resolve" ? 2 : 1);
    parts[targetIndex] = replacements.get(parts[targetIndex]) || parts[targetIndex];
    return parts.join(",");
  }).filter((rule) => {
    if (/^RULE-SET,(StaticResources|CDNResources|AdditionalCDNResources),/.test(rule)) {
      cdnRules.push(rule);
      return false;
    }
    return rule !== "RULE-SET,SteamFix,DIRECT";
  });

  // 精确服务优先于大分类和 CDN。游戏平台保留国内域名/下载直连，Xbox 单独控制。
  const serviceIndex = rules.findIndex((rule) => rule.startsWith(
    "GEOSITE,category-cryptocurrency,"));
  rules.splice(serviceIndex < 0 ? 0 : serviceIndex, 0,
    "GEOSITE,paypal,PayPal",
    "GEOSITE,meta,Meta",
    "GEOSITE,discord,Discord",
    "RULE-SET,SteamFix,DIRECT",
    "GEOSITE,category-games@cn,DIRECT");
  const xboxIndex = rules.findIndex((rule) => rule.startsWith("GEOSITE,xbox,"));
  rules.splice(xboxIndex < 0 ? rules.length - 1 : xboxIndex + 1, 0,
    "GEOSITE,category-games,游戏平台");
  const fallbackIndex = rules.findIndex((rule) => /^(RULE-SET,GFWList,|GEOIP,cn,|MATCH,)/i.test(
    rule));
  rules.splice(fallbackIndex < 0 ? rules.length : fallbackIndex, 0, ...cdnRules);
  config.rules = unique(rules);
  return config;
}

/** 国家与地区识别：旗帜优先，其次完整名称/城市，最后独立国家代码。 */
const KOSUZU_REGIONS = [
  ["香港", "HK", "香港|港|Hong Kong|HongKong|九龙|九龍|HKG"],
  ["台湾", "TW", "台湾|台灣|台北|新北|高雄|Taiwan|Taipei|TPE"],
  ["新加坡", "SG", "新加坡|狮城|獅城|Singapore|SIN"],
  ["日本", "JP", "日本|东京|東京|大阪|埼玉|Japan|Tokyo|Osaka|JPN|NRT|HND|KIX"],
  ["韩国", "KR", "韩国|韓國|首尔|首爾|春川|釜山|South Korea|Korea|Seoul|Busan|ICN"],
  ["美国", "US",
    "美国|美國|美西|美东|美東|洛杉矶|洛杉磯|圣何塞|聖何塞|西雅图|西雅圖|纽约|紐約|达拉斯|芝加哥|硅谷|United States|UnitedStates|America|Los Angeles|San Jose|Seattle|New York|Dallas|USA|LAX|SJC|SEA|JFK|SFO|ORD|DFW|IAD|MIA"
  ],
  ["荷兰", "NL", "荷兰|荷蘭|阿姆斯特丹|鹿特丹|Netherlands|Holland|Amsterdam|Rotterdam|NLD|AMS|RTM"],
  ["英国", "GB",
    "英国|英國|伦敦|倫敦|曼彻斯特|United Kingdom|Great Britain|Britain|England|London|Manchester|UK|GBR|LHR|LGW"
  ],
  ["德国", "DE", "德国|德國|法兰克福|法蘭克福|柏林|慕尼黑|Germany|Frankfurt|Berlin|Munich|DEU|FRA|MUC"],
  ["法国", "FR", "法国|法國|巴黎|马赛|France|Paris|Marseille|CDG|MRS"],
  ["加拿大", "CA", "加拿大|多伦多|多倫多|温哥华|溫哥華|蒙特利尔|Canada|Toronto|Vancouver|Montreal|YYZ|YVR|YUL"],
  ["澳大利亚", "AU", "澳大利亚|澳大利亞|澳洲|悉尼|墨尔本|Australia|Sydney|Melbourne|SYD|MEL"],
  ["澳门", "MO", "澳门|澳門|Macau|Macao|MFM"],
  ["中国", "CN", "中国|中國|大陆|大陸|北京|上海|广州|深圳|China|Beijing|Shanghai|Guangzhou|Shenzhen|PEK|PVG|SZX"],
  ["瑞士", "CH", "瑞士|苏黎世|蘇黎世|日内瓦|Switzerland|Zurich|Geneva|ZRH|GVA"],
  ["瑞典", "SE", "瑞典|斯德哥尔摩|Sweden|Stockholm|ARN"],
  ["芬兰", "FI", "芬兰|芬蘭|赫尔辛基|Finland|Helsinki|HEL"],
  ["挪威", "NO", "挪威|奥斯陆|Norway|Oslo|OSL"],
  ["丹麦", "DK", "丹麦|丹麥|哥本哈根|Denmark|Copenhagen|CPH"],
  ["冰岛", "IS", "冰岛|冰島|雷克雅未克|Iceland|Reykjavik|KEF"],
  ["爱尔兰", "IE", "爱尔兰|愛爾蘭|都柏林|Ireland|Dublin|DUB"],
  ["意大利", "IT", "意大利|義大利|米兰|米蘭|罗马|羅馬|Italy|Milan|Rome|MXP|FCO"],
  ["西班牙", "ES", "西班牙|马德里|巴塞罗那|Spain|Madrid|Barcelona|MAD|BCN"],
  ["葡萄牙", "PT", "葡萄牙|里斯本|Portugal|Lisbon|LIS"],
  ["比利时", "BE", "比利时|比利時|布鲁塞尔|Belgium|Brussels|BRU"],
  ["卢森堡", "LU", "卢森堡|盧森堡|Luxembourg|LUX"],
  ["奥地利", "AT", "奥地利|奧地利|维也纳|Austria|Vienna|VIE"],
  ["波兰", "PL", "波兰|波蘭|华沙|Poland|Warsaw|WAW"],
  ["捷克", "CZ", "捷克|布拉格|Czechia|Czech|Prague|PRG"],
  ["匈牙利", "HU", "匈牙利|布达佩斯|Hungary|Budapest|BUD"],
  ["罗马尼亚", "RO", "罗马尼亚|羅馬尼亞|布加勒斯特|Romania|Bucharest|OTP"],
  ["保加利亚", "BG", "保加利亚|保加利亞|索非亚|Bulgaria|Sofia|SOF"],
  ["希腊", "GR", "希腊|希臘|雅典|Greece|Athens|ATH"],
  ["俄罗斯", "RU", "俄罗斯|俄羅斯|莫斯科|圣彼得堡|Russia|Moscow|Saint Petersburg|SVO|DME|LED"],
  ["白俄罗斯", "BY", "白俄罗斯|白俄羅斯|明斯克|Belarus|Minsk|MSQ"],
  ["乌克兰", "UA", "乌克兰|烏克蘭|基辅|Ukraine|Kyiv|Kiev|KBP"],
  ["土耳其", "TR", "土耳其|伊斯坦布尔|伊斯坦堡|Turkey|Türkiye|Turkiye|Istanbul|IST"],
  ["马来西亚", "MY", "马来西亚|馬來西亞|吉隆坡|Malaysia|Kuala Lumpur|KUL"],
  ["泰国", "TH", "泰国|泰國|曼谷|Thailand|Bangkok|BKK"],
  ["越南", "VN", "越南|河内|胡志明|Vietnam|Hanoi|Ho Chi Minh|HAN|SGN"],
  ["菲律宾", "PH", "菲律宾|菲律賓|马尼拉|Philippines|Manila|MNL"],
  ["印度尼西亚", "ID", "印度尼西亚|印度尼西亞|印尼|雅加达|Indonesia|Jakarta|CGK"],
  ["印度", "IN", "印度|孟买|孟買|新德里|班加罗尔|India|Mumbai|New Delhi|Bangalore|BOM|DEL|BLR"],
  ["柬埔寨", "KH", "柬埔寨|金边|Cambodia|Phnom Penh|PNH"],
  ["尼泊尔", "NP", "尼泊尔|尼泊爾|加德满都|Nepal|Kathmandu|KTM"],
  ["巴基斯坦", "PK", "巴基斯坦|卡拉奇|Pakistan|Karachi|KHI"],
  ["孟加拉国", "BD", "孟加拉国|孟加拉國|达卡|Bangladesh|Dhaka|DAC"],
  ["新西兰", "NZ", "新西兰|新西蘭|奥克兰|New Zealand|Auckland|AKL"],
  ["阿联酋", "AE", "阿联酋|阿聯酋|迪拜|United Arab Emirates|Dubai|UAE|DXB"],
  ["以色列", "IL", "以色列|特拉维夫|Israel|Tel Aviv|TLV"],
  ["沙特阿拉伯", "SA", "沙特阿拉伯|沙特|利雅得|Saudi Arabia|Riyadh|RUH"],
  ["哈萨克斯坦", "KZ", "哈萨克斯坦|哈薩克斯坦|阿拉木图|Kazakhstan|Almaty|ALA"],
  ["亚美尼亚", "AM", "亚美尼亚|亞美尼亞|埃里温|Armenia|Yerevan|EVN"],
  ["巴西", "BR", "巴西|圣保罗|聖保羅|Brazil|Sao Paulo|GRU"],
  ["阿根廷", "AR", "阿根廷|布宜诺斯艾利斯|Argentina|Buenos Aires|EZE"],
  ["智利", "CL", "智利|圣地亚哥|Chile|Santiago|SCL"],
  ["墨西哥", "MX", "墨西哥|Mexico|MEX"],
  ["南非", "ZA", "南非|约翰内斯堡|South Africa|Johannesburg|JNB"],
  ["埃及", "EG", "埃及|开罗|Egypt|Cairo|CAI"],
  ["尼日利亚", "NG", "尼日利亚|尼日利亞|Nigeria|Lagos|LOS"],
  ["肯尼亚", "KE", "肯尼亚|肯尼亞|Kenya|Nairobi|NBO"],
];

function kosuzuEscapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function kosuzuFlag(code) {
  return Array.from(code, (letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397)).join("");
}

const KOSUZU_REGION_MATCHERS = KOSUZU_REGIONS.map(([name, code, aliases]) => ({
  name,
  code,
  flag: kosuzuFlag(code),
  aliases: aliases.split("|").map((alias) => ({
    alias,
    regex: new RegExp(/[A-Za-z]/.test(alias) ?
      `(?:^|[^A-Za-z])${kosuzuEscapeRegex(alias)}(?:$|[^A-Za-z])` :
      kosuzuEscapeRegex(alias), "i"),
  })),
  // 下划线和数字可作为分隔符；in / it / no 等常见词仅认大写或带编号形式。
  codeRegex: new RegExp(
    `(?:^|[^A-Za-z])(?:${code}(?:$|[^A-Za-z])|${code.toLowerCase()}[-_ ]?\\d)`,
    ["IN", "IT", "NO", "IS", "AT", "BE", "MY", "AM", "ID"].includes(code) ? "" : "i"),
}));

function kosuzuIdentifyRegion(nodeName) {
  const name = String(nodeName || "");
  const flag = KOSUZU_REGION_MATCHERS.find((region) => name.includes(region.flag));
  if (flag) return flag.name;

  // 最长名称先匹配，避免「印度尼西亚」「白俄罗斯」被短名称抢先匹配。
  let best = null;
  let length = 0;
  for (const region of KOSUZU_REGION_MATCHERS) {
    for (const item of region.aliases) {
      if (item.alias.length > length && item.regex.test(name)) {
        best = region.name;
        length = item.alias.length;
      }
    }
  }
  if (best) return best;
  return KOSUZU_REGION_MATCHERS.find((region) => region.codeRegex.test(name))?.name;
}

function createKosuzuRegionGroups(config, args) {
  const landing = config["proxy-groups"].some((group) => group.name === "前置代理");
  const nodes = config.proxies.filter((node) => !landing || node["dialer-proxy"] !== "前置代理");
  const buckets = new Map();
  for (const node of nodes) {
    const name = kosuzuIdentifyRegion(node.name);
    if (!name) continue;
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push(node.name);
  }

  const thresholdValue = Number(args.threshold);
  const threshold = args.threshold != null && Number.isFinite(thresholdValue) ?
    Math.max(1, Math.floor(thresholdValue)) : 1;
  const typeValue = Number(args.grouptype ?? 1);
  const groupType = [0, 1, 2].includes(typeValue) ? typeValue : 1;
  return KOSUZU_REGIONS.flatMap(([name, code]) => {
    const proxies = [...new Set(buckets.get(name) || [])];
    if (proxies.length < threshold) return [];
    return [{
      name: `${name}节点`,
      icon: `https://flagcdn.com/w80/${code.toLowerCase()}.png`,
      type: ["select", "url-test", "load-balance"][groupType],
      proxies,
      ...(groupType === 0 ? {} : {
        url: "https://cp.cloudflare.com",
        interval: 60,
        tolerance: 20,
      }),
      ...(groupType === 2 ? {
        strategy: "sticky-sessions"
      } : {}),
    }];
  });
}

// -----------------------------------------------------------------------------
// 上游分流 · mihomo/vendor/powerfullz/convert.js
// -----------------------------------------------------------------------------

const powerfullzOverrideMain = (() => {
  const globalThis = {};

  "use strict";
  (() => {
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __esm = (fn, res, err) => function __init() {
      if (err) throw err[0];
      try {
        return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
      } catch (e) {
        throw err = [e], e;
      }
    };
    var __commonJS = (cb, mod) => function __require() {
      try {
        return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = {
          exports: {}
        }).exports, mod), mod.exports;
      } catch (e) {
        throw mod = 0, e;
      }
    };

    // 通用工具 · src/utils.ts
    function parseBool(value, defaultValue = false) {
      if (typeof value === "undefined") return defaultValue;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
      }
      return false;
    }

    function parseNumber(value, defaultValue = 0) {
      if (value === null || typeof value === "undefined") {
        return defaultValue;
      }
      const num = parseInt(String(value), 10);
      return Number.isNaN(num) ? defaultValue : num;
    }

    function buildList(...elements) {
      return elements.flat().filter(Boolean);
    }

    function createCaseInsensitiveNodeMatcher(source) {
      return {
        source,
        regex: new RegExp(source, "i"),
        pattern: `(?i)${source}`
      };
    }

    function isNotNull(v) {
      return v !== null;
    }
    var init_utils = __esm({
      "src/utils.ts"() {
        "use strict";
      }
    });

    // 地区与分组定义 · src/constants.ts
    var NODE_SUFFIX, CDN_URL, SPEEDTEST_URL, LOW_COST_NODE_MATCHER, PROXY_GROUPS,
      countriesMeta;
    var init_constants = __esm({
      "src/constants.ts"() {
        "use strict";
        init_utils();
        NODE_SUFFIX = "节点";
        CDN_URL = "https://cdn.jsdelivr.net";
        SPEEDTEST_URL = "https://cp.cloudflare.com";
        LOW_COST_NODE_MATCHER = createCaseInsensitiveNodeMatcher(
          String.raw`0\.[0-5]|低倍率|省流|实验性`
        );
        PROXY_GROUPS = {
          SELECT: "选择代理",
          MANUAL: "手动选择",
          AUTO: "自动选择",
          FALLBACK: "故障转移",
          LANDING: "落地节点",
          LOW_COST: "低倍率节点",
          FRONT_PROXY: "前置代理",
          STATIC_RESOURCES: "静态资源",
          AI_SERVICE: "AI服务",
          CRYPTO: "加密货币",
          FINANCE: "金融服务",
          APPLE: "苹果服务",
          GOOGLE: "谷歌服务",
          MICROSOFT: "微软服务",
          BILIBILI: "哔哩哔哩",
          BAHAMUT: "巴哈姆特",
          XBOX: "Xbox",
          TAILSCALE: "Tailscale",
          GITHUB: "Github",
          YOUTUBE: "Youtube",
          NETFLIX: "Netflix",
          TIKTOK: "TikTok",
          SPOTIFY: "Spotify",
          EHENTAI: "E-Hentai",
          TELEGRAM: "Telegram",
          TRUTH_SOCIAL: "Truth Social",
          TWITTER: "Twitter",
          TWITCH: "Twitch",
          WEIBO: "新浪微博",
          PIKPAK: "PikPak网盘",
          SOGOU_INPUT: "搜狗输入法",
          AD_BLOCK: "广告拦截",
          GLOBAL: "GLOBAL",
          FINAL: "Final"
        };
        countriesMeta = {
          香港: {
            weight: 10,
            pattern: "香港|港|\\b(?:HK|hk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌|🇭🇰",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Hong_Kong.png`
          },
          澳门: {
            pattern: "澳门|\\b(?:MO|mo)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Macau|🇲🇴",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Macao.png`
          },
          台湾: {
            weight: 20,
            pattern: "台|新北|彰化|\\b(?:TW|tw)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC|🇹🇼|🇼🇸",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Taiwan.png`
          },
          新加坡: {
            weight: 30,
            pattern: "新加坡|坡|狮城|\\b(?:SG|sg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN|🇸🇬",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Singapore.png`
          },
          日本: {
            weight: 40,
            pattern: "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\\b(?:JP|jp)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI|🇯🇵",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Japan.png`
          },
          韩国: {
            weight: 45,
            pattern: "韩国|韩|韓|春川|Chuncheon|首尔|\\b(?:KR|kr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|ICN|🇰🇷",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Korea.png`
          },
          美国: {
            weight: 50,
            pattern: "美国|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|亚特兰大|迈阿密|华盛顿|\\b(?:US|us)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC|🇺🇸",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/United_States.png`,
            excludePattern: "美属|亚美尼亚|圣多美|普林西比"
          },
          加拿大: {
            weight: 55,
            pattern: "加拿大|渥太华|温哥华|卡尔加里|蒙特利尔|Montreal|\\b(?:CA|ca)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Canada|CANADA|CAN|YVR|YYZ|YUL|🇨🇦",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Canada.png`
          },
          英国: {
            weight: 60,
            pattern: "英国|伦敦|曼彻斯特|Manchester|\\b(?:UK|uk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Britain|United Kingdom|UNITED KINGDOM|England|GBR|LHR|MAN|🇬🇧",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/United_Kingdom.png`
          },
          澳大利亚: {
            pattern: "澳洲|澳大利亚|\\b(?:AU|au)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Australia|🇦🇺",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Australia.png`
          },
          德国: {
            weight: 70,
            pattern: "德国|德|柏林|法兰克福|慕尼黑|Munich|\\b(?:DE|de)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Germany|GERMANY|DEU|MUC|🇩🇪",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Germany.png`,
            excludePattern: "瓜德罗普"
          },
          法国: {
            weight: 80,
            pattern: "法国|法|巴黎|马赛|Marseille|\\b(?:FR|fr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|France|FRANCE|FRA|CDG|MRS|🇫🇷",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/France.png`,
            excludePattern: "法属|布基纳法索|法罗"
          },
          俄罗斯: {
            pattern: "俄罗斯|俄|\\b(?:RU|ru)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Russia|🇷🇺",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Russia.png`,
            excludePattern: "埃塞俄比亚|白俄罗斯"
          },
          泰国: {
            pattern: "泰国|泰|\\b(?:TH|th)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Thailand|🇹🇭",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Thailand.png`,
            excludePattern: "巴泰"
          },
          印度: {
            pattern: "印度|\\b(?:IN|in)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|India|🇮🇳",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/India.png`,
            excludePattern: "印度洋"
          },
          马来西亚: {
            pattern: "马来西亚|马来|\\b(?:MY|my)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Malaysia|🇲🇾",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Malaysia.png`
          },
          阿根廷: {
            pattern: "阿根廷|布宜诺斯艾利斯|\\b(?:AR|ar)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Argentina|EZE|🇦🇷",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Argentina.png`
          },
          芬兰: {
            pattern: "芬兰|赫尔辛基|\\b(?:FI|fi)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Finland|HEL|🇫🇮",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Finland.png`
          },
          埃及: {
            pattern: "埃及|开罗|\\b(?:EG|eg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Egypt|CAI|🇪🇬",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Egypt.png`
          },
          菲律宾: {
            pattern: "菲律宾|马尼拉|\\b(?:PH|ph)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Philippines|MNL|🇵🇭",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Philippines.png`
          },
          土耳其: {
            pattern: "土耳其|伊斯坦布尔|\\b(?:TR|tr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Turkey|Türkiye|IST|🇹🇷",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Turkey.png`
          },
          乌克兰: {
            pattern: "乌克兰|基辅|\\b(?:UA|ua)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Ukraine|KBP|🇺🇦",
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Ukraine.png`
          }
        };
      }
    });

    // 参数解析 · src/args.ts
    function parseGroupType(args) {
      if (parseBool(args.loadbalance)) return 2;
      const raw = parseNumber(args.grouptype, 1);
      if (raw === 0 || raw === 1 || raw === 2) return raw;
      return 1;
    }

    function buildFeatureFlags(args) {
      return {
        groupType: parseGroupType(args),
        ipv6Enabled: parseBool(args.ipv6),
        fullConfig: parseBool(args.full),
        keepAliveEnabled: parseBool(args.keepalive),
        fakeIPEnabled: parseBool(args.fakeip, true),
        quicEnabled: parseBool(args.quic),
        regexFilter: parseBool(args.regex),
        tunEnabled: parseBool(args.tun),
        countryThreshold: parseNumber(args.threshold, 2)
      };
    }
    var init_args = __esm({
      "src/args.ts"() {
        "use strict";
        init_utils();
      }
    });

    // 代理组生成 · src/proxy_groups.ts
    function buildGroupByType({
      name,
      icon,
      groupType,
      nodeSource
    }) {
      switch (groupType) {
        case 0:
          return {
            name, icon, type: "select", ...nodeSource
          };
        case 1:
          return {
            name,
            icon,
            type: "url-test",
              url: SPEEDTEST_URL,
              interval: 60,
              tolerance: 20,
              ...nodeSource
          };
        case 2:
          return {
            name,
            icon,
            type: "load-balance",
              strategy: "sticky-sessions",
              url: SPEEDTEST_URL,
              interval: 60,
              tolerance: 20,
              ...nodeSource
          };
      }
    }

    function buildProxyGroups({
      allNodes,
      regexFilter,
      groupType,
      countryNames,
      countryNodes,
      lowCostNodes,
      tailscaleNodes,
      landing,
      landingNodes,
      defaultProxies,
      defaultProxiesDirect,
      defaultSelector,
      defaultFallback,
      frontProxySelector
    }) {
      const hasTW = countryNames.includes("台湾");
      const hasHK = countryNames.includes("香港");
      const hasUS = countryNames.includes("美国");
      const hasTailscale = tailscaleNodes.length > 0;
      const groups = [{
          name: PROXY_GROUPS.SELECT,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Proxy.png`,
          type: "select",
          proxies: defaultSelector
        }, {
          name: PROXY_GROUPS.MANUAL,
          icon: `${CDN_URL}/gh/shindgewongxj/WHATSINStash@master/icon/select.png`,
          type: "select",
          proxies: allNodes
        },
        landing ? {
          name: PROXY_GROUPS.FRONT_PROXY,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Area.png`,
          type: "select",
          proxies: frontProxySelector
        } : null,
        landing ? {
          name: PROXY_GROUPS.LANDING,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Airport.png`,
          type: "select",
          proxies: landingNodes.map((node) => node.name).filter(isNotNull)
        } : null, {
          name: PROXY_GROUPS.STATIC_RESOURCES,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Cloudflare.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.AI_SERVICE,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/ChatGPT.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.CRYPTO,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Cryptocurrency_1.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.FINANCE,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/Nasdaq.png`,
          type: "select",
          proxies: defaultProxiesDirect
        }, {
          name: PROXY_GROUPS.APPLE,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Apple_2.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.GOOGLE,
          icon: `${CDN_URL}/gh/Orz-3/mini@master/Color/Google.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.MICROSOFT,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/Microsoft_Copilot.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.XBOX,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Xbox.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.GITHUB,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/GitHub.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.BILIBILI,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/bilibili.png`,
          type: "select",
          proxies: hasTW && hasHK ? ["DIRECT", `台湾节点`, `香港节点`] : defaultProxiesDirect
        }, {
          name: PROXY_GROUPS.BAHAMUT,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Bahamut.png`,
          type: "select",
          proxies: hasTW ? [`台湾节点`, PROXY_GROUPS.SELECT, PROXY_GROUPS.MANUAL, "DIRECT"] :
            defaultProxies
        }, {
          name: PROXY_GROUPS.YOUTUBE,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/YouTube.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.TWITCH,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Twitch.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.NETFLIX,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Netflix.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.TIKTOK,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/TikTok.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.SPOTIFY,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Spotify.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.TELEGRAM,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/Telegram.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.TWITTER,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Twitter.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.WEIBO,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Weibo.png`,
          type: "select",
          "include-all": true,
          proxies: defaultProxiesDirect
        }, {
          name: PROXY_GROUPS.TRUTH_SOCIAL,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/Truth_Social.png`,
          type: "select",
          proxies: hasUS ? [`美国节点`, PROXY_GROUPS.SELECT, PROXY_GROUPS.MANUAL] :
            defaultProxies
        }, {
          name: PROXY_GROUPS.EHENTAI,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/Ehentai.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.PIKPAK,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/PikPak.png`,
          type: "select",
          proxies: defaultProxies
        }, {
          name: PROXY_GROUPS.SOGOU_INPUT,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/Sougou.png`,
          type: "select",
          proxies: ["DIRECT", "REJECT"]
        },
        hasTailscale ? {
          name: PROXY_GROUPS.TAILSCALE,
          icon: `${CDN_URL}/gh/powerfullz/override-rules@master/icons/Tailscale.png`,
          type: "select",
          proxies: tailscaleNodes.map((node) => node.name).filter(isNotNull)
        } : null, {
          name: PROXY_GROUPS.AD_BLOCK,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png`,
          type: "select",
          proxies: ["REJECT", "REJECT-DROP", "DIRECT"]
        }, {
          name: PROXY_GROUPS.FINAL,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Final.png`,
          type: "select",
          proxies: [PROXY_GROUPS.SELECT, "DIRECT"]
        }, {
          name: PROXY_GROUPS.AUTO,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Auto.png`,
          type: "url-test",
          url: SPEEDTEST_URL,
          proxies: defaultFallback,
          interval: 60,
          tolerance: 20
        }, {
          name: PROXY_GROUPS.FALLBACK,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Available_1.png`,
          type: "fallback",
          url: SPEEDTEST_URL,
          proxies: defaultFallback,
          interval: 60,
          tolerance: 20
        },
        lowCostNodes.length > 0 || regexFilter ? buildGroupByType({
          name: PROXY_GROUPS.LOW_COST,
          icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Lab.png`,
          groupType,
          nodeSource: !regexFilter ? {
            proxies: lowCostNodes.map((node) => node.name).filter(isNotNull)
          } : {
            "include-all": true,
            filter: LOW_COST_NODE_MATCHER.pattern
          }
        }) : null,
        ...countryNames.map((country) => {
          const meta = countriesMeta[country];
          if (!meta) return null;
          const nodeSource = regexFilter ? {
            "include-all": true,
            filter: meta.pattern,
            ...meta.excludePattern ? {
              "exclude-filter": meta.excludePattern
            } : {}
          } : {
            proxies: countryNodes[country]?.map((n) => n.name).filter(isNotNull)
          };
          return buildGroupByType({
            name: `${country}${NODE_SUFFIX}`,
            icon: meta.icon,
            groupType,
            nodeSource
          });
        })
      ];
      return groups.filter(isNotNull);
    }
    var init_proxy_groups = __esm({
      "src/proxy_groups.ts"() {
        "use strict";
        init_constants();
        init_utils();
      }
    });

    // 节点识别 · src/node_parser.ts
    function parseTailscale(nodes) {
      return (nodes || []).filter((proxy) => proxy.type === "tailscale" || false);
    }

    function parseLowCost(nodes) {
      return (nodes || []).filter((proxy) => LOW_COST_NODE_MATCHER.regex.test(proxy.name ||
        ""));
    }

    function parseNodesByLanding(nodes) {
      const landingNodes = [];
      const nonLandingNodes = [];
      for (const node of nodes || []) {
        const name = node.name;
        if (!name) continue;
        if (node["dialer-proxy"] === "前置代理") {
          landingNodes.push(node);
        } else {
          nonLandingNodes.push(node);
        }
      }
      return {
        landingNodes,
        nonLandingNodes
      };
    }

    function parseCountries(nodes) {
      const countryNodes = /* @__PURE__ */ Object.create(null);
      for (const node of nodes) {
        const name = node.name || "";
        for (const [country, regex] of Object.entries(COUNTRY_REGEX_MAP)) {
          if (!regex.test(name)) continue;
          if (COUNTRY_EXCLUDE_MAP[country]?.test(name)) continue;
          if (!countryNodes[country]) {
            countryNodes[country] = [];
          }
          countryNodes[country].push(node);
          break;
        }
      }
      return countryNodes;
    }

    function getActiveCountryNames(countryNodes, minCount) {
      const filtered = Object.entries(countryNodes).filter(([, nodes]) => nodes.length >=
        minCount);
      filtered.sort(([a], [b]) => {
        const wa = countriesMeta[a]?.weight ?? Infinity;
        const wb = countriesMeta[b]?.weight ?? Infinity;
        return wa - wb;
      });
      return filtered.map(([country]) => country);
    }
    var COUNTRY_REGEX_MAP, COUNTRY_EXCLUDE_MAP;
    var init_node_parser = __esm({
      "src/node_parser.ts"() {
        "use strict";
        init_constants();
        COUNTRY_REGEX_MAP = Object.fromEntries(
          Object.entries(countriesMeta).map(([country, meta]) => {
            return [country, new RegExp(meta.pattern.replace(/^\(\?i\)/, ""))];
          })
        );
        COUNTRY_EXCLUDE_MAP = Object.fromEntries(
          Object.entries(countriesMeta).filter(([, meta]) => meta.excludePattern).map(([
            country, meta
          ]) => [country, new RegExp(meta.excludePattern)])
        );
      }
    });

    // 分流规则 · src/rules.ts
    function buildRules({
      quicEnabled
    }, tailscale) {
      return [
        !quicEnabled ? `AND,((DST-PORT,443),(NETWORK,UDP)),REJECT` : null,
        tailscale ? `IP-CIDR,100.64.0.0/10,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
        tailscale ? `IP-CIDR,fd7a:115c:a1e0::/48,${PROXY_GROUPS.TAILSCALE},no-resolve` :
        null,
        tailscale ? `DOMAIN-SUFFIX,ts.net,${PROXY_GROUPS.TAILSCALE}` : null,
        `GEOIP,private,DIRECT,no-resolve`,
        `RULE-SET,ADBlock,${PROXY_GROUPS.AD_BLOCK}`,
        `RULE-SET,AdditionalFilter,${PROXY_GROUPS.AD_BLOCK}`,
        `RULE-SET,SogouInput,${PROXY_GROUPS.SOGOU_INPUT}`,
        `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
        `RULE-SET,StaticResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
        `RULE-SET,CDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
        `RULE-SET,AdditionalCDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
        `GEOSITE,category-cryptocurrency,${PROXY_GROUPS.CRYPTO}`,
        `GEOSITE,category-finance,${PROXY_GROUPS.FINANCE}`,
        `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
        `GEOSITE,bilibili,${PROXY_GROUPS.BILIBILI}`,
        `GEOSITE,youtube,${PROXY_GROUPS.YOUTUBE}`,
        `GEOSITE,telegram,${PROXY_GROUPS.TELEGRAM}`,
        `GEOIP,telegram,${PROXY_GROUPS.TELEGRAM},no-resolve`,
        `GEOSITE,xbox,${PROXY_GROUPS.XBOX}`,
        `GEOSITE,github,${PROXY_GROUPS.GITHUB}`,
        `GEOSITE,netflix,${PROXY_GROUPS.NETFLIX}`,
        `GEOSITE,twitch,${PROXY_GROUPS.TWITCH}`,
        `GEOIP,netflix,${PROXY_GROUPS.NETFLIX},no-resolve`,
        `GEOSITE,spotify,${PROXY_GROUPS.SPOTIFY}`,
        `GEOSITE,bahamut,${PROXY_GROUPS.BAHAMUT}`,
        `GEOSITE,pikpak,${PROXY_GROUPS.PIKPAK}`,
        `GEOSITE,twitter,${PROXY_GROUPS.TWITTER}`,
        `RULE-SET,Weibo,${PROXY_GROUPS.WEIBO}`,
        `RULE-SET,EHentai,${PROXY_GROUPS.EHENTAI}`,
        `RULE-SET,TikTok,${PROXY_GROUPS.TIKTOK}`,
        `RULE-SET,SteamFix,DIRECT`,
        `RULE-SET,GoogleFCM,DIRECT`,
        `GEOSITE,google-play@cn,DIRECT`,
        `GEOSITE,microsoft@cn,DIRECT`,
        `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
        `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
        `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
        `RULE-SET,GFWList,${PROXY_GROUPS.SELECT}`,
        `GEOIP,cn,DIRECT`,
        `MATCH,${PROXY_GROUPS.FINAL}`
      ].filter(isNotNull);
    }
    var init_rules = __esm({
      "src/rules.ts"() {
        "use strict";
        init_constants();
        init_utils();
      }
    });

    // 规则集 · src/rule_providers.ts
    var ruleProviders;
    var init_rule_providers = __esm({
      "src/rule_providers.ts"() {
        "use strict";
        init_constants();
        ruleProviders = {
          ADBlock: {
            type: "http",
            behavior: "domain",
            format: "yaml",
            interval: 86400,
            url: `${CDN_URL}/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml`,
            path: "./ruleset/ADBlock.yaml"
          },
          SogouInput: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: "https://ruleset.skk.moe/Clash/non_ip/sogouinput.txt",
            path: "./ruleset/SogouInput.txt"
          },
          StaticResources: {
            type: "http",
            behavior: "domain",
            format: "text",
            interval: 86400,
            url: "https://ruleset.skk.moe/Clash/domainset/cdn.txt",
            path: "./ruleset/StaticResources.txt"
          },
          CDNResources: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
            path: "./ruleset/CDNResources.txt"
          },
          TikTok: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/TikTok.list`,
            path: "./ruleset/TikTok.list"
          },
          EHentai: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/EHentai.list`,
            path: "./ruleset/EHentai.list"
          },
          SteamFix: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/SteamFix.list`,
            path: "./ruleset/SteamFix.list"
          },
          GoogleFCM: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/FirebaseCloudMessaging.list`,
            path: "./ruleset/FirebaseCloudMessaging.list"
          },
          AdditionalFilter: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/AdditionalFilter.list`,
            path: "./ruleset/AdditionalFilter.list"
          },
          AdditionalCDNResources: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/AdditionalCDNResources.list`,
            path: "./ruleset/AdditionalCDNResources.list"
          },
          Weibo: {
            type: "http",
            behavior: "classical",
            format: "text",
            interval: 86400,
            url: `${CDN_URL}/gh/powerfullz/override-rules@master/ruleset/Weibo.list`,
            path: "./ruleset/Weibo.list"
          },
          GFWList: {
            type: "http",
            behavior: "domain",
            format: "yaml",
            interval: 86400,
            url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt",
            path: "./ruleset/GFWList.yaml"
          }
        };
      }
    });

    // 上游 DNS 与域名嗅探 · src/dns.ts
    function isRecord(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    function getStringList(value) {
      return Array.isArray(value) && value.every((item) => typeof item === "string") ? value :
        void 0;
    }

    function mergeStringLists(current, upstream) {
      const upstreamList = getStringList(upstream);
      if (!current && !upstreamList) return void 0;
      return [... /* @__PURE__ */ new Set([...current ?? [], ...upstreamList ?? []])];
    }

    function mergeDnsPolicies(current, upstream) {
      if (!isRecord(upstream)) return current;
      const upstreamPolicy = {};
      for (const [key, value] of Object.entries(upstream)) {
        if (typeof value === "string") {
          upstreamPolicy[key] = value;
        } else if (getStringList(value)) {
          upstreamPolicy[key] = value;
        }
      }
      return {
        ...current ?? {},
        ...upstreamPolicy
      };
    }

    function inheritDnsFields(generated, upstream) {
      if (!isRecord(upstream)) return generated;
      const merged = {
        ...generated
      };
      for (const field of DNS_POLICY_FIELDS) {
        const policy = mergeDnsPolicies(merged[field], upstream[field]);
        if (policy) merged[field] = policy;
      }
      const fakeIpFilter = mergeStringLists(merged["fake-ip-filter"], upstream[
        "fake-ip-filter"]);
      if (fakeIpFilter) merged["fake-ip-filter"] = fakeIpFilter;
      return merged;
    }

    function buildDnsConfig({
      mode,
      ipv6Enabled,
      fakeIpFilter
    }) {
      const config = {
        enable: true,
        ipv6: ipv6Enabled,
        "prefer-h3": true,
        "enhanced-mode": mode,
        nameserver: ["system", "223.5.5.5", "119.29.29.29", "180.184.1.1"],
        fallback: [
          "quic://dns0.eu",
          "https://dns.cloudflare.com/dns-query",
          "https://dns.sb/dns-query",
          "tcp://208.67.222.222",
          "tcp://8.26.56.2"
        ]
      };
      if (fakeIpFilter) {
        config["fake-ip-filter"] = fakeIpFilter;
      }
      return config;
    }

    function buildDns({
      fakeIPEnabled,
      ipv6Enabled,
      upstreamDns
    }) {
      const generated = fakeIPEnabled ? buildDnsConfig({
        mode: "fake-ip",
        ipv6Enabled,
        fakeIpFilter: FAKE_IP_FILTER
      }) : buildDnsConfig({
        mode: "redir-host",
        ipv6Enabled
      });
      return inheritDnsFields(generated, upstreamDns);
    }
    var FAKE_IP_FILTER, snifferConfig, DNS_POLICY_FIELDS;
    var init_dns = __esm({
      "src/dns.ts"() {
        "use strict";
        FAKE_IP_FILTER = [
          "geosite:connectivity-check",
          "Mijia Cloud",
          "dig.io.mi.com",
          "localhost.ptlogin2.qq.com",
          "*.icloud.com",
          "*.stun.*.*",
          "*.stun.*.*.*",
          "*.lan",
          "*.localdomain",
          "*.example",
          "*.invalid",
          "*.localhost",
          "*.test",
          "*.local",
          "*.home.arpa",
          "time.*.com",
          "time.*.gov",
          "time.*.edu.cn",
          "time.*.apple.com",
          "time1.*.com",
          "time2.*.com",
          "time3.*.com",
          "time4.*.com",
          "time5.*.com",
          "time6.*.com",
          "time7.*.com",
          "ntp.*.com",
          "ntp1.*.com",
          "ntp2.*.com",
          "ntp3.*.com",
          "ntp4.*.com",
          "ntp5.*.com",
          "ntp6.*.com",
          "ntp7.*.com",
          "*.time.edu.cn",
          "*.ntp.org.cn",
          "+.pool.ntp.org",
          "time1.cloud.tencent.com",
          "stun.*.*",
          "stun.*.*.*",
          "swscan.apple.com",
          "mesu.apple.com",
          "music.163.com",
          "*.music.163.com",
          "*.126.net",
          "musicapi.taihe.com",
          "music.taihe.com",
          "songsearch.kugou.com",
          "trackercdn.kugou.com",
          "*.kuwo.cn",
          "api-jooxtt.sanook.com",
          "api.joox.com",
          "y.qq.com",
          "*.y.qq.com",
          "streamoc.music.tc.qq.com",
          "mobileoc.music.tc.qq.com",
          "isure.stream.qqmusic.qq.com",
          "dl.stream.qqmusic.qq.com",
          "aqqmusic.tc.qq.com",
          "amobile.music.tc.qq.com",
          "localhost.ptlogin2.qq.com",
          "*.msftconnecttest.com",
          "*.msftncsi.com",
          "*.xiami.com",
          "*.music.migu.cn",
          "music.migu.cn",
          "+.wotgame.cn",
          "+.wggames.cn",
          "+.wowsgame.cn",
          "+.wargaming.net",
          "*.*.*.srv.nintendo.net",
          "*.*.stun.playstation.net",
          "xbox.*.*.microsoft.com",
          "*.*.xboxlive.com",
          "*.ipv6.microsoft.com",
          "teredo.*.*.*",
          "teredo.*.*",
          "speedtest.cros.wr.pvp.net",
          "+.jjvip8.com",
          "www.douyu.com",
          "activityapi.huya.com",
          "activityapi.huya.com.w.cdngslb.com",
          "www.bilibili.com",
          "api.bilibili.com",
          "a.w.bilicdn1.com",
          "+.apt-agent.com"
        ];
        snifferConfig = {
          sniff: {
            TLS: {
              ports: [443, 8443]
            },
            HTTP: {
              ports: [80, 8080, 8880]
            },
            QUIC: {
              ports: [443, 8443]
            }
          },
          "override-destination": false,
          enable: true,
          "force-dns-mapping": true,
          "skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"]
        };
        DNS_POLICY_FIELDS = ["nameserver-policy", "proxy-server-nameserver-policy"];
      }
    });

    // TUN 设置 · src/tun.ts
    function buildTunConfig(tunEnabled, tailscale) {
      return {
        enable: tunEnabled,
        stack: "gvisor",
        device: "mihomo",
        "route-exclude-address": [
          !tailscale ? "100.64.0.0/10" : null,
          !tailscale ? "fd7a:115c:a1e0::/48" : null,
          "192.168.0.0/16"
        ].filter(isNotNull),
        "dns-hijack": ["any:53"],
        mtu: 1500
      };
    }
    var init_tun = __esm({
      "src/tun.ts"() {
        "use strict";
        init_utils();
      }
    });

    // 代理候选列表 · src/selectors.ts
    function buildBaseLists({
      landing,
      lowCostNodes,
      countryNames,
      nonLandingNodes,
      regexFilter
    }) {
      const suffixedCountryNames = countryNames.map((c) => c + NODE_SUFFIX);
      const lowCost = lowCostNodes.length > 0 || regexFilter;
      const defaultSelector = buildList(
        PROXY_GROUPS.AUTO,
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        suffixedCountryNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
      );
      const defaultProxies = buildList(
        PROXY_GROUPS.SELECT,
        landing && PROXY_GROUPS.LANDING,
        suffixedCountryNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
      );
      const defaultProxiesDirect = buildList(
        "DIRECT",
        landing && PROXY_GROUPS.LANDING,
        suffixedCountryNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
      );
      const defaultFallback = buildList(landing && PROXY_GROUPS.LANDING,
      suffixedCountryNames);
      const frontProxySelector = buildList(
        suffixedCountryNames,
        "DIRECT",
        !regexFilter && nonLandingNodes.map((node) => node.name).filter(Boolean)
      );
      return {
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback,
        frontProxySelector
      };
    }
    var init_selectors = __esm({
      "src/selectors.ts"() {
        "use strict";
        init_constants();
        init_utils();
      }
    });

    // 上游配置入口 · src/main.ts
    var require_main = __commonJS({
      "src/main.ts"() {
        init_constants();
        init_args();
        init_proxy_groups();
        init_node_parser();
        init_rules();
        init_rule_providers();
        init_dns();
        init_tun();
        init_selectors();
        var geoxURL = {
          geoip: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geoip.dat`,
          geosite: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/geosite.dat`,
          mmdb: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/country.mmdb`,
          asn: `${CDN_URL}/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb`
        };

        function getRawArgs() {
          try {
            return $arguments;
          } catch {
            return {};
          }
        }
        var rawArgs = getRawArgs();
        var {
          groupType,
          ipv6Enabled,
          fullConfig,
          keepAliveEnabled,
          fakeIPEnabled,
          quicEnabled,
          regexFilter,
          tunEnabled,
          countryThreshold
        } = buildFeatureFlags(rawArgs);

        function main(config) {
          if (!config.proxies || !Array.isArray(config.proxies)) {
            throw new Error("[powerfullz 的覆写脚本] 错误：Clash 配置中缺少有效的 proxies 字段");
          }
          const {
            landingNodes,
            nonLandingNodes
          } = parseNodesByLanding(config.proxies);
          const landing = landingNodes.length > 0 && nonLandingNodes.length > 0;
          const countryNodes = parseCountries(landing ? nonLandingNodes : config.proxies);
          const lowCostNodes = parseLowCost(landing ? nonLandingNodes : config.proxies);
          const countryNames = getActiveCountryNames(countryNodes, countryThreshold);
          const allNodes = config.proxies.map((node) => node.name);
          const tailscaleNodes = parseTailscale(config.proxies);
          const hasTailscale = tailscaleNodes.length > 0;
          const {
            defaultProxies,
            defaultProxiesDirect,
            defaultSelector,
            defaultFallback,
            frontProxySelector
          } = buildBaseLists({
            landing,
            lowCostNodes,
            countryNames,
            nonLandingNodes,
            regexFilter
          });
          const proxyGroups = buildProxyGroups({
            allNodes,
            regexFilter,
            groupType,
            countryNames,
            countryNodes,
            lowCostNodes,
            tailscaleNodes,
            landing,
            landingNodes,
            defaultProxies,
            defaultProxiesDirect,
            defaultSelector,
            defaultFallback,
            frontProxySelector
          });
          const globalProxies = proxyGroups.map((item) => String(item.name));
          proxyGroups.push({
            name: PROXY_GROUPS.GLOBAL,
            icon: `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color/Global.png`,
            "include-all": true,
            type: "select",
            proxies: globalProxies
          });
          const finalRules = buildRules({
            quicEnabled
          }, hasTailscale);
          return {
            proxies: config.proxies,
            ...config.hosts !== void 0 && {
              hosts: config.hosts
            },
            ...fullConfig && {
              "mixed-port": 7890,
              "redir-port": 7892,
              "tproxy-port": 7893,
              "routing-mark": 7894,
              "allow-lan": true,
              "bind-address": "*",
              ipv6: ipv6Enabled,
              mode: "rule",
              "unified-delay": true,
              "tcp-concurrent": true,
              "find-process-mode": "off",
              "log-level": "info",
              "geodata-loader": "standard",
              "external-controller": ":9999",
              "disable-keep-alive": !keepAliveEnabled,
              profile: {
                "store-selected": true
              }
            },
            "proxy-groups": proxyGroups,
            "rule-providers": ruleProviders,
            rules: finalRules,
            sniffer: snifferConfig,
            dns: buildDns({
              fakeIPEnabled,
              ipv6Enabled,
              upstreamDns: config.dns
            }),
            tun: buildTunConfig(tunEnabled, hasTailscale),
            "geodata-mode": true,
            "geox-url": geoxURL
          };
        }
        globalThis.main = main;
      }
    });
    require_main();
  })();

  return globalThis.main;
})();

globalThis.main = main;
