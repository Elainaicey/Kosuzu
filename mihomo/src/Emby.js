/**
 * powerfullz v2.5.0 的 Emby 最小补充脚本
 *
 * 执行顺序：
 * 1. powerfullz convert.min.js
 * 2. 本脚本
 * 3. dns.yaml 覆写
 *
 * 通常直接使用生成后的 mihomo/Override.js，无需单独加载本脚本。
 */
function main(config) {
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
      icon:
        "https://cdn.jsdelivr.net/gh/Koolson/Qure@master/" +
        "IconSet/Color/Emby.png",
      proxies: embyTargets,
    });
  }

  providers.SUPPLEMENT_Emby = {
    type: "http",
    behavior: "domain",
    format: "mrs",
    interval: 86400,
    url:
      "https://github.com/666OS/rules/raw/release/" +
      "mihomo/domain/Emby.mrs",
    path: "./ruleset/supplement/Emby.mrs",
  };

  providers.SUPPLEMENT_EmbyIP = {
    type: "http",
    behavior: "ipcidr",
    format: "mrs",
    interval: 86400,
    url:
      "https://github.com/666OS/rules/raw/release/" +
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
