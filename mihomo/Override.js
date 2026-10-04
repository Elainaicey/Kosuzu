/**
 * Kosuzu · Mihomo 配置覆写
 * 版本：1.0.1
 *
 * 所有策略组均为 select；由用户选择并保存节点。
 * 直接修改本文件中的策略、地区和 DNS 配置。
 *
 * 基础规则参考：https://github.com/powerfullz/override-rules
 * 授权：LICENSE
 */
"use strict";

// -----------------------------------------------------------------------------
// 配置入口
// -----------------------------------------------------------------------------

function main(config) {
  if (!config || !Array.isArray(config.proxies)) {
    throw new Error("[Kosuzu] 配置中缺少有效的 proxies 数组");
  }
  const names = new Set();
  for (const node of config.proxies) {
    if (!node || typeof node.name !== "string" || !node.name.trim()) {
      throw new Error("[Kosuzu] 每个节点都必须有非空名称");
    }
    if (names.has(node.name)) {
      throw new Error(`[Kosuzu] 节点名称重复：${node.name}`);
    }
    names.add(node.name);
  }
  const options = createKosuzuOptions();
  const hasTailscale = config.proxies.some((node) => node.type === "tailscale");
  const runtime = createKosuzuRuntime(options, hasTailscale);
  const groups = createKosuzuGroups(config.proxies, options);
  validateKosuzuReferences(config.proxies, groups);
  return {
    proxies: config.proxies,
    ...(config.hosts !== undefined
      ? {
          hosts: config.hosts,
        }
      : {}),
    ...runtime,
    profile: {
      ...config.profile,
      ...runtime.profile,
    },
    "proxy-groups": groups,
    "rule-providers": createKosuzuProviders(),
    rules: createKosuzuRules(options, hasTailscale),
    dns: createCustomDns(),
  };
}

// -----------------------------------------------------------------------------
// 自定义 DNS
// -----------------------------------------------------------------------------

// 每次创建独立对象，完整替换输入配置的 DNS。
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
      "+.ntp.org",
    ],

    // 解析 DNS 服务器自身的域名
    "default-nameserver": ["tls://223.5.5.5", "tls://223.6.6.6"],

    // 代理节点域名：直连解析，避免循环依赖
    "proxy-server-nameserver": [
      "https://dns.alidns.com/dns-query#DIRECT",
      "https://doh.pub/dns-query#DIRECT",
    ],

    // 默认解析：连接遵守分流规则
    nameserver: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],

    // 直连域名：使用国内加密 DNS
    "direct-nameserver": [
      "https://dns.alidns.com/dns-query#DIRECT",
      "https://doh.pub/dns-query#DIRECT",
    ],
    "direct-nameserver-follow-policy": false,

    // 国内域名优先使用国内 DNS
    "nameserver-policy": {
      "geosite:cn": ["https://dns.alidns.com/dns-query#DIRECT", "https://doh.pub/dns-query#DIRECT"],
    },
  };
}

// -----------------------------------------------------------------------------
// 策略组与分流规则
// -----------------------------------------------------------------------------

/** 最终策略组与分流规则：直接生成需要的内容。 */
const KOSUZU_SERVICES = [
  // 经常切换出口的 AI 与影音。
  ["AI服务", "ChatGPT"],
  ["Emby服", "Emby"],
  ["Netflix", "Netflix"],
  ["Youtube", "YouTube"],
  ["巴哈姆特", "Bahamut", "台湾节点"],
  ["Twitch", "Twitch"],
  ["Spotify", "Spotify"],

  // 社交与通信。
  ["Telegram", "Telegram"],
  ["Discord", "Discord"],
  ["Meta", "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/png/meta.png"],
  ["Twitter", "Twitter"],
  ["TikTok", "TikTok"],

  // 游戏、开发与厂商服务。
  ["游戏平台", "Game"],
  ["Xbox", "Xbox"],
  ["Github", "GitHub"],
  ["谷歌服务", "Google"],
  ["微软服务", "Microsoft", "DIRECT"],
  ["苹果服务", "Apple", "DIRECT"],

  // 支付与加密货币。
  ["PayPal", "PayPal"],
  ["加密货币", "Cryptocurrency_1"],
];

function kosuzuUnique(items) {
  return [...new Set(items.filter(Boolean))];
}

function createKosuzuSelect(name, proxies, icon) {
  const candidates = kosuzuUnique(proxies);
  return {
    name,
    type: "select",
    proxies: candidates.length ? candidates : ["DIRECT"],
    ...(icon
      ? {
          icon: icon.startsWith("https://")
            ? icon
            : `https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/${icon}.png`,
        }
      : {}),
  };
}

function createKosuzuGroups(proxies, options) {
  const landingNodes = proxies.filter((node) => node["dialer-proxy"] === "前置代理");
  const frontNodes = proxies.filter((node) => node["dialer-proxy"] !== "前置代理");
  const hasLanding = landingNodes.length > 0;
  const regions = createKosuzuRegionGroups(hasLanding ? frontNodes : proxies, options);
  const regionNames = regions.map((group) => group.name);
  const allNames = kosuzuUnique(proxies.map((node) => node.name));
  const landingExit = hasLanding ? ["落地节点"] : [];
  const primaryExits = ["选择代理", "备用选择"];
  const exits = kosuzuUnique([...primaryExits, ...regionNames, ...landingExit, "DIRECT"]);
  const commonNames = new Set([
    "美国节点",
    "香港节点",
    "日本节点",
    "新加坡节点",
    "台湾节点",
    "韩国节点",
  ]);
  const groups = [
    createKosuzuSelect("选择代理", [...landingExit, ...regionNames, "备用选择", "DIRECT"], "Proxy"),
    createKosuzuSelect("备用选择", allNames, "Available_1"),
    createKosuzuSelect("Final", [...exits, ...allNames], "Final"),
    ...regions.filter((group) => commonNames.has(group.name)),
    ...KOSUZU_SERVICES.map(([name, icon, preferred]) =>
      createKosuzuSelect(
        name,
        exits.includes(preferred) ? [...primaryExits, preferred, ...exits] : exits,
        icon,
      ),
    ),
    ...regions.filter((group) => !commonNames.has(group.name)),
  ];

  if (hasLanding) {
    groups.push(
      createKosuzuSelect(
        "落地节点",
        landingNodes.map((node) => node.name),
        "Airport",
      ),
      createKosuzuSelect(
        "前置代理",
        [...regionNames, "DIRECT", ...frontNodes.map((node) => node.name)],
        "Area",
      ),
    );
  }
  const tailscaleNodes = proxies.filter((node) => node.type === "tailscale");
  if (tailscaleNodes.length) {
    groups.push(
      createKosuzuSelect(
        "Tailscale",
        tailscaleNodes.map((node) => node.name),
        "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@main/icons/Tailscale.png",
      ),
    );
  }
  groups.push(createKosuzuSelect("广告拦截", ["REJECT", "REJECT-DROP", "DIRECT"], "AdBlack"));
  groups.push(
    createKosuzuSelect("GLOBAL", [...groups.map((group) => group.name), "DIRECT"], "Global"),
  );
  return groups;
}

// 检查节点、策略组和链式代理的名称依赖，尽早给出可定位的错误。
function validateKosuzuReferences(proxies, groups) {
  const builtins = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"]);
  const dependencies = new Map(groups.map((group) => [group.name, group.proxies]));
  for (const node of proxies) {
    if (builtins.has(node.name) || dependencies.has(node.name)) {
      throw new Error(`[Kosuzu] 节点名称与策略组或内置出口冲突：${node.name}`);
    }
    dependencies.set(node.name, node["dialer-proxy"] ? [node["dialer-proxy"]] : []);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(name) {
    if (builtins.has(name) || visited.has(name)) return;
    if (!dependencies.has(name)) {
      throw new Error(`[Kosuzu] 引用了不存在的节点或策略组：${name}`);
    }
    if (visiting.has(name)) {
      throw new Error(`[Kosuzu] 节点或策略组存在循环引用：${name}`);
    }
    visiting.add(name);
    for (const target of dependencies.get(name)) visit(target);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of dependencies.keys()) visit(name);
}

function createKosuzuProvider(behavior, format, url, filename) {
  return {
    type: "http",
    behavior,
    format,
    interval: 86400,
    url,
    path: `./ruleset/${filename}`,
  };
}

function createKosuzuProviders() {
  const upstream = "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@main/ruleset";
  const sukka = "https://ruleset.skk.moe/Clash";
  const emby = "https://github.com/666OS/rules/raw/release/mihomo";
  const text = (name, filename = `${name}.list`) =>
    createKosuzuProvider("classical", "text", `${upstream}/${filename}`, filename);
  return {
    ADBlock: createKosuzuProvider(
      "domain",
      "yaml",
      "https://cdn.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml",
      "ADBlock.yaml",
    ),
    AdditionalFilter: text("AdditionalFilter"),
    SogouInput: createKosuzuProvider(
      "classical",
      "text",
      `${sukka}/non_ip/sogouinput.txt`,
      "SogouInput.txt",
    ),
    TikTok: text("TikTok"),
    EHentai: text("EHentai"),
    SteamFix: text("SteamFix"),
    GoogleFCM: text("GoogleFCM", "FirebaseCloudMessaging.list"),
    Weibo: text("Weibo"),
    StaticResources: createKosuzuProvider(
      "domain",
      "text",
      `${sukka}/domainset/cdn.txt`,
      "StaticResources.txt",
    ),
    CDNResources: createKosuzuProvider(
      "classical",
      "text",
      `${sukka}/non_ip/cdn.txt`,
      "CDNResources.txt",
    ),
    AdditionalCDNResources: text("AdditionalCDNResources"),
    GFWList: createKosuzuProvider(
      "domain",
      "yaml",
      "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt",
      "GFWList.yaml",
    ),
    SUPPLEMENT_Emby: createKosuzuProvider(
      "domain",
      "mrs",
      `${emby}/domain/Emby.mrs`,
      "supplement/Emby.mrs",
    ),
    SUPPLEMENT_EmbyIP: createKosuzuProvider(
      "ipcidr",
      "mrs",
      `${emby}/ip/Emby.mrs`,
      "supplement/EmbyIP.mrs",
    ),
  };
}

function createKosuzuRules(options, hasTailscale) {
  return [
    ...(!options.quic ? ["AND,((DST-PORT,443),(NETWORK,UDP)),REJECT"] : []),
    ...(hasTailscale
      ? [
          "IP-CIDR,100.64.0.0/10,Tailscale,no-resolve",
          "IP-CIDR,fd7a:115c:a1e0::/48,Tailscale,no-resolve",
          "DOMAIN-SUFFIX,ts.net,Tailscale",
        ]
      : []),
    "GEOIP,private,DIRECT,no-resolve",
    "RULE-SET,ADBlock,广告拦截",
    "RULE-SET,AdditionalFilter,广告拦截",

    // 明确的服务规则优先匹配；没有独立策略组的域名直接指定出口。
    "RULE-SET,SogouInput,DIRECT",
    "DOMAIN-SUFFIX,truthsocial.com,选择代理",
    "GEOSITE,paypal,PayPal",
    "GEOSITE,meta,Meta",
    "GEOSITE,discord,Discord",
    "RULE-SET,SteamFix,DIRECT",
    "GEOSITE,category-games@cn,DIRECT",
    "GEOSITE,category-cryptocurrency,加密货币",
    "GEOSITE,category-finance,选择代理",
    "GEOSITE,category-ai-!cn,AI服务",
    "GEOSITE,bilibili,DIRECT",
    "GEOSITE,youtube,Youtube",
    "GEOSITE,telegram,Telegram",
    "GEOIP,telegram,Telegram,no-resolve",
    "GEOSITE,xbox,Xbox",
    "GEOSITE,category-games,游戏平台",
    "GEOSITE,github,Github",
    "GEOSITE,netflix,Netflix",
    "GEOSITE,twitch,Twitch",
    "GEOIP,netflix,Netflix,no-resolve",
    "GEOSITE,spotify,Spotify",
    "GEOSITE,bahamut,巴哈姆特",
    "GEOSITE,pikpak,选择代理",
    "GEOSITE,twitter,Twitter",
    "RULE-SET,Weibo,DIRECT",
    "RULE-SET,EHentai,选择代理",
    "RULE-SET,TikTok,TikTok",
    "RULE-SET,GoogleFCM,DIRECT",
    "GEOSITE,google-play@cn,DIRECT",
    "GEOSITE,microsoft@cn,DIRECT",
    "GEOSITE,apple,苹果服务",
    "GEOSITE,microsoft,微软服务",
    "GEOSITE,google,谷歌服务",
    "RULE-SET,SUPPLEMENT_Emby,Emby服",
    "RULE-SET,SUPPLEMENT_EmbyIP,Emby服,no-resolve",

    // CDN 与最后的兜底规则。
    "RULE-SET,StaticResources,选择代理",
    "RULE-SET,CDNResources,选择代理",
    "RULE-SET,AdditionalCDNResources,选择代理",
    "RULE-SET,GFWList,选择代理",
    "GEOIP,cn,DIRECT",
    "MATCH,Final",
  ];
}

// -----------------------------------------------------------------------------
// 国家与地区识别
// -----------------------------------------------------------------------------

/** 国家与地区识别：旗帜优先，其次完整名称/城市，最后独立国家代码。 */
// prettier-ignore
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

// 显示顺序与识别表分开维护，调整常用地区不影响名称识别。
// prettier-ignore
const KOSUZU_REGION_ORDER = [
  "美国", "香港", "日本", "新加坡", "台湾", "韩国",
  "英国", "德国", "荷兰", "加拿大", "法国", "澳大利亚",
  "瑞士", "瑞典", "芬兰", "意大利", "西班牙", "新西兰", "俄罗斯", "土耳其",
  "马来西亚", "泰国", "越南", "菲律宾", "印度尼西亚", "印度", "澳门", "中国",
  "爱尔兰", "挪威", "丹麦", "比利时", "奥地利", "波兰", "捷克", "葡萄牙", "卢森堡",
  "阿联酋", "巴西", "阿根廷", "墨西哥", "南非",
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
    regex: new RegExp(
      /[A-Za-z]/.test(alias)
        ? `(?:^|[^A-Za-z])${kosuzuEscapeRegex(alias)}(?:$|[^A-Za-z])`
        : kosuzuEscapeRegex(alias),
      "i",
    ),
  })),
  // 下划线和数字可作为分隔符；in / it / no 等常见词仅认大写或带编号形式。
  codeRegex: new RegExp(
    `(?:^|[^A-Za-z])(?:${code}(?:$|[^A-Za-z])|${code.toLowerCase()}[-_ ]?\\d)`,
    ["IN", "IT", "NO", "IS", "AT", "BE", "MY", "AM", "ID"].includes(code) ? "" : "i",
  ),
}));

function kosuzuIdentifyRegion(nodeName) {
  // CN2 是线路名称；完整名称和国旗仍可识别同名节点的真实地区。
  const name = String(nodeName || "").replace(/(^|[^A-Za-z])CN2(?=$|[^A-Za-z0-9])/gi, "$1");
  const firstFlag = name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0];
  const flag = KOSUZU_REGION_MATCHERS.find((region) => region.flag === firstFlag);
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

function createKosuzuRegionGroups(nodes, options) {
  const buckets = new Map();
  for (const node of nodes) {
    const name = kosuzuIdentifyRegion(node.name);
    if (!name) continue;
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push(node.name);
  }

  const groups = KOSUZU_REGIONS.flatMap(([name, code]) => {
    const proxies = [...new Set(buckets.get(name) || [])];
    if (proxies.length < options.threshold) return [];
    return [
      createKosuzuSelect(
        `${name}节点`,
        proxies,
        `https://flagcdn.com/w80/${code.toLowerCase()}.png`,
      ),
    ];
  });
  const rank = new Map(KOSUZU_REGION_ORDER.map((name, index) => [`${name}节点`, index]));
  return groups.sort((a, b) => (rank.get(a.name) ?? 999) - (rank.get(b.name) ?? 999));
}

// -----------------------------------------------------------------------------
// 运行设置
// -----------------------------------------------------------------------------

/** 运行参数、嗅探、TUN 与 Geo 数据。 */
function kosuzuBool(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    (typeof value === "string" && value.toLowerCase() === "true")
  );
}

function createKosuzuOptions() {
  const args = typeof $arguments === "object" && $arguments ? $arguments : {};
  const threshold = Number(args.threshold);
  return {
    threshold:
      args.threshold != null && Number.isFinite(threshold) ? Math.max(1, Math.floor(threshold)) : 1,
    quic: kosuzuBool(args.quic),
    tun: kosuzuBool(args.tun),
    full: kosuzuBool(args.full),
    ipv6: kosuzuBool(args.ipv6),
    keepalive: kosuzuBool(args.keepalive),
  };
}

function createKosuzuRuntime(options, hasTailscale) {
  const geoBase = "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release";
  return {
    ...(options.full
      ? {
          "mixed-port": 7890,
          "redir-port": 7892,
          "tproxy-port": 7893,
          "routing-mark": 7894,
          "allow-lan": true,
          "bind-address": "*",
          ipv6: options.ipv6,
          mode: "rule",
          "unified-delay": true,
          "tcp-concurrent": true,
          "find-process-mode": "off",
          "log-level": "info",
          "geodata-loader": "standard",
          "external-controller": ":9999",
          "disable-keep-alive": !options.keepalive,
        }
      : {}),
    profile: {
      "store-selected": true,
    },
    sniffer: {
      sniff: {
        TLS: {
          ports: [443, 8443],
        },
        HTTP: {
          ports: [80, 8080, 8880],
        },
        QUIC: {
          ports: [443, 8443],
        },
      },
      "override-destination": false,
      enable: true,
      "force-dns-mapping": true,
      "skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"],
    },
    tun: {
      enable: options.tun,
      stack: "gvisor",
      device: "mihomo",
      "route-exclude-address": hasTailscale
        ? ["192.168.0.0/16"]
        : ["100.64.0.0/10", "fd7a:115c:a1e0::/48", "192.168.0.0/16"],
      "dns-hijack": ["any:53"],
      mtu: 1500,
    },
    "geodata-mode": true,
    "geox-url": {
      geoip: `${geoBase}/geoip.dat`,
      geosite: `${geoBase}/geosite.dat`,
      mmdb: `${geoBase}/country.mmdb`,
      asn: `${geoBase}/GeoLite2-ASN.mmdb`,
    },
  };
}
