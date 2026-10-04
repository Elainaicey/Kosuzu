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
        ...regionNames, ...extraExits, "手动选择", "DIRECT"]);
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
  const commonRegions = regionNames.filter((name) =>
    ["香港节点", "台湾节点", "新加坡节点", "日本节点", "韩国节点", "美国节点"].includes(name));
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
  const serviceIndex = rules.findIndex((rule) => rule.startsWith("GEOSITE,category-cryptocurrency,"));
  rules.splice(serviceIndex < 0 ? 0 : serviceIndex, 0,
    "GEOSITE,paypal,PayPal",
    "GEOSITE,meta,Meta",
    "GEOSITE,discord,Discord",
    "RULE-SET,SteamFix,DIRECT",
    "GEOSITE,category-games@cn,DIRECT");
  const xboxIndex = rules.findIndex((rule) => rule.startsWith("GEOSITE,xbox,"));
  rules.splice(xboxIndex < 0 ? rules.length - 1 : xboxIndex + 1, 0,
    "GEOSITE,category-games,游戏平台");
  const fallbackIndex = rules.findIndex((rule) => /^(RULE-SET,GFWList,|GEOIP,cn,|MATCH,)/i.test(rule));
  rules.splice(fallbackIndex < 0 ? rules.length : fallbackIndex, 0, ...cdnRules);
  config.rules = unique(rules);
  return config;
}
