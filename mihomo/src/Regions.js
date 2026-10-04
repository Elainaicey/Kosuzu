/** 国家与地区识别：旗帜优先，其次完整名称/城市，最后独立国家代码。 */
const KOSUZU_REGIONS = [
  ["香港", "HK", "香港|港|Hong Kong|HongKong|九龙|九龍|HKG"],
  ["台湾", "TW", "台湾|台灣|台北|新北|高雄|Taiwan|Taipei|TPE"],
  ["新加坡", "SG", "新加坡|狮城|獅城|Singapore|SIN"],
  ["日本", "JP", "日本|东京|東京|大阪|埼玉|Japan|Tokyo|Osaka|JPN|NRT|HND|KIX"],
  ["韩国", "KR", "韩国|韓國|首尔|首爾|春川|釜山|South Korea|Korea|Seoul|Busan|ICN"],
  ["美国", "US", "美国|美國|美西|美东|美東|洛杉矶|洛杉磯|圣何塞|聖何塞|西雅图|西雅圖|纽约|紐約|达拉斯|芝加哥|硅谷|United States|UnitedStates|America|Los Angeles|San Jose|Seattle|New York|Dallas|USA|LAX|SJC|SEA|JFK|SFO|ORD|DFW|IAD|MIA"],
  ["荷兰", "NL", "荷兰|荷蘭|阿姆斯特丹|鹿特丹|Netherlands|Holland|Amsterdam|Rotterdam|NLD|AMS|RTM"],
  ["英国", "GB", "英国|英國|伦敦|倫敦|曼彻斯特|United Kingdom|Great Britain|Britain|England|London|Manchester|UK|GBR|LHR|LGW"],
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
    regex: new RegExp(/[A-Za-z]/.test(alias)
      ? `(?:^|[^A-Za-z])${kosuzuEscapeRegex(alias)}(?:$|[^A-Za-z])`
      : kosuzuEscapeRegex(alias), "i"),
  })),
  // 下划线和数字可作为分隔符；in / it / no 等常见词仅认大写或带编号形式。
  codeRegex: new RegExp(`(?:^|[^A-Za-z])(?:${code}(?:$|[^A-Za-z])|${code.toLowerCase()}[-_ ]?\\d)`,
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
    return [{
      name: `${name}节点`,
      icon: `https://flagcdn.com/w80/${code.toLowerCase()}.png`,
      type: "select",
      proxies,
    }];
  });
  const rank = new Map(KOSUZU_REGION_ORDER.map((name, index) => [`${name}节点`, index]));
  return groups.sort((a, b) => (rank.get(a.name) ?? 999) - (rank.get(b.name) ?? 999));
}
