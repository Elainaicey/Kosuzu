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
  return {
    name,
    type: "select",
    proxies: proxies.length ? kosuzuUnique(proxies) : ["DIRECT"],
    ...(icon ? {
      icon: icon.startsWith("https://") ? icon
        : `https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/${icon}.png`,
    } : {}),
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
  const exits = kosuzuUnique(["选择代理", ...regionNames, ...landingExit, "备用选择", "DIRECT"]);
  const commonNames = new Set(["美国节点", "香港节点", "日本节点", "新加坡节点", "台湾节点", "韩国节点"]);
  const groups = [
    createKosuzuSelect("选择代理", [...landingExit, ...regionNames, "备用选择", "DIRECT"], "Proxy"),
    createKosuzuSelect("备用选择", allNames, "Available_1"),
    createKosuzuSelect("Final", [...exits, ...allNames], "Final"),
    ...regions.filter((group) => commonNames.has(group.name)),
    ...KOSUZU_SERVICES.map(([name, icon, preferred]) =>
      createKosuzuSelect(name, exits.includes(preferred) ? [preferred, ...exits] : exits, icon)),
    ...regions.filter((group) => !commonNames.has(group.name)),
  ];

  if (hasLanding) {
    groups.push(
      createKosuzuSelect("落地节点", landingNodes.map((node) => node.name), "Airport"),
      createKosuzuSelect("前置代理", [...regionNames, "DIRECT", ...frontNodes.map((node) => node.name)], "Area")
    );
  }
  const tailscaleNodes = proxies.filter((node) => node.type === "tailscale");
  if (tailscaleNodes.length) {
    groups.push(createKosuzuSelect("Tailscale", tailscaleNodes.map((node) => node.name),
      "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@main/icons/Tailscale.png"));
  }
  groups.push(createKosuzuSelect("广告拦截", ["REJECT", "REJECT-DROP", "DIRECT"], "AdBlack"));
  groups.push(createKosuzuSelect("GLOBAL", [...groups.map((group) => group.name), "DIRECT"], "Global"));
  return groups;
}

function createKosuzuProvider(behavior, format, url, filename) {
  return { type: "http", behavior, format, interval: 86400, url, path: `./ruleset/${filename}` };
}

function createKosuzuProviders() {
  const upstream = "https://cdn.jsdelivr.net/gh/powerfullz/override-rules@main/ruleset";
  const sukka = "https://ruleset.skk.moe/Clash";
  const text = (name, filename = `${name}.list`) =>
    createKosuzuProvider("classical", "text", `${upstream}/${filename}`, filename);
  return {
    ADBlock: createKosuzuProvider("domain", "yaml",
      "https://cdn.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml", "ADBlock.yaml"),
    AdditionalFilter: text("AdditionalFilter"),
    SogouInput: createKosuzuProvider("classical", "text", `${sukka}/non_ip/sogouinput.txt`, "SogouInput.txt"),
    TikTok: text("TikTok"),
    EHentai: text("EHentai"),
    SteamFix: text("SteamFix"),
    GoogleFCM: text("GoogleFCM", "FirebaseCloudMessaging.list"),
    Weibo: text("Weibo"),
    StaticResources: createKosuzuProvider("domain", "text", `${sukka}/domainset/cdn.txt`, "StaticResources.txt"),
    CDNResources: createKosuzuProvider("classical", "text", `${sukka}/non_ip/cdn.txt`, "CDNResources.txt"),
    AdditionalCDNResources: text("AdditionalCDNResources"),
    GFWList: createKosuzuProvider("domain", "yaml",
      "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt", "GFWList.yaml"),
    ...createEmbyProviders(),
  };
}

function createKosuzuRules(options, hasTailscale) {
  return [
    ...(!options.quic ? ["AND,((DST-PORT,443),(NETWORK,UDP)),REJECT"] : []),
    ...(hasTailscale ? [
      "IP-CIDR,100.64.0.0/10,Tailscale,no-resolve",
      "IP-CIDR,fd7a:115c:a1e0::/48,Tailscale,no-resolve",
      "DOMAIN-SUFFIX,ts.net,Tailscale",
    ] : []),
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
    ...createEmbyRules(),

    // CDN 与最后的兜底规则。
    "RULE-SET,StaticResources,选择代理",
    "RULE-SET,CDNResources,选择代理",
    "RULE-SET,AdditionalCDNResources,选择代理",
    "RULE-SET,GFWList,选择代理",
    "GEOIP,cn,DIRECT",
    "MATCH,Final",
  ];
}
