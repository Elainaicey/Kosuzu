/** Emby 规则源；分组和规则顺序统一由 Policies.js 定义。 */
function createEmbyProviders() {
  const base = "https://github.com/666OS/rules/raw/release/mihomo";
  return {
    SUPPLEMENT_Emby: createKosuzuProvider("domain", "mrs",
      `${base}/domain/Emby.mrs`, "supplement/Emby.mrs"),
    SUPPLEMENT_EmbyIP: createKosuzuProvider("ipcidr", "mrs",
      `${base}/ip/Emby.mrs`, "supplement/EmbyIP.mrs"),
  };
}

function createEmbyRules() {
  return [
    "RULE-SET,SUPPLEMENT_Emby,Emby服",
    "RULE-SET,SUPPLEMENT_EmbyIP,Emby服,no-resolve",
  ];
}
