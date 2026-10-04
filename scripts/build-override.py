"""Build and format the standalone Mihomo override."""

import argparse
import json
import re
from pathlib import Path

import jsbeautifier
import yaml


ROOT = Path(__file__).resolve().parents[1]
MIHOMO = ROOT / "mihomo"
OUTPUT = MIHOMO / "Override.js"

def render_dns(dns):
    """Keep the DNS settings grouped and readable without changing their values."""
    sections = {
        "enable": "基础设置",
        "enhanced-mode": "Fake IP 模式",
        "use-hosts": "本地 Hosts",
        "fake-ip-filter": "返回真实 IP 的域名",
        "default-nameserver": "解析 DNS 服务器自身的域名",
        "proxy-server-nameserver": "代理节点域名：直连解析，避免循环依赖",
        "nameserver": "默认解析：连接遵守分流规则",
        "direct-nameserver": "直连域名：使用国内加密 DNS",
        "nameserver-policy": "国内域名优先使用国内 DNS",
    }
    lines = ["  return {"]
    for index, (key, value) in enumerate(dns.items()):
        if key in sections:
            if index:
                lines.append("")
            lines.append(f"    // {sections[key]}")
        property_name = key if re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", key) else json.dumps(key, ensure_ascii=False)
        value_lines = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).splitlines()
        lines.append(f"    {property_name}: {value_lines[0]}")
        lines.extend("    " + line for line in value_lines[1:])
        if index < len(dns) - 1:
            lines[-1] += ","
    lines.append("  };")
    return "\n".join(lines)


def build():
    cloud = (MIHOMO / "src/Emby.js").read_text(encoding="utf-8-sig")
    regions = (MIHOMO / "src/Regions.js").read_text(encoding="utf-8-sig")
    policies = (MIHOMO / "src/Policies.js").read_text(encoding="utf-8-sig")
    settings = (MIHOMO / "src/Settings.js").read_text(encoding="utf-8-sig")
    dns_source = (MIHOMO / "src/dns.yaml").read_text(encoding="utf-8-sig")
    data = yaml.safe_load(dns_source)
    if not isinstance(data, dict) or set(data) != {"dns"}:
        raise ValueError("dns.yaml must contain only a top-level dns section")
    if not isinstance(data["dns"], dict):
        raise ValueError("dns.yaml: dns must be an object")
    output = f'''/**
 * Kosuzu · Mihomo 配置覆写
 * 版本：2026.10.04.1
 *
 * 所有策略组均为 select；由用户选择并保存节点。
 * DNS 来源：mihomo/src/dns.yaml。
 * 重新生成：python scripts/build-override.py
 *
 * 基础规则参考：https://github.com/powerfullz/override-rules
 * 授权：vendor/powerfullz/LICENSE
 */
"use strict";

// -----------------------------------------------------------------------------
// 配置入口
// -----------------------------------------------------------------------------

function main(config) {{
  if (!config || !Array.isArray(config.proxies)) {{
    throw new Error("[Kosuzu] 配置中缺少有效的 proxies 数组");
  }}
  const options = createKosuzuOptions();
  const hasTailscale = config.proxies.some((node) => node.type === "tailscale");
  const runtime = createKosuzuRuntime(options, hasTailscale);
  return {{
    proxies: config.proxies,
    ...(config.hosts !== undefined ? {{ hosts: config.hosts }} : {{}}),
    ...runtime,
    profile: {{ ...config.profile, ...runtime.profile }},
    "proxy-groups": createKosuzuGroups(config.proxies, options),
    "rule-providers": createKosuzuProviders(),
    rules: createKosuzuRules(options, hasTailscale),
    dns: createCustomDns(),
  }};
}}

// -----------------------------------------------------------------------------
// 自定义 DNS · mihomo/src/dns.yaml
// -----------------------------------------------------------------------------

// 每次创建独立对象，完整替换输入配置的 DNS。
function createCustomDns() {{
{render_dns(data["dns"])}
}}

// -----------------------------------------------------------------------------
// 策略组与分流规则 · mihomo/src/Policies.js
// -----------------------------------------------------------------------------

{policies.strip()}

// -----------------------------------------------------------------------------
// 国家与地区识别 · mihomo/src/Regions.js
// -----------------------------------------------------------------------------

{regions.strip()}

// -----------------------------------------------------------------------------
// Emby 规则源 · mihomo/src/Emby.js
// -----------------------------------------------------------------------------

{cloud.strip()}

// -----------------------------------------------------------------------------
// 运行设置 · mihomo/src/Settings.js
// -----------------------------------------------------------------------------

{settings.strip()}
'''
    forbidden = [
        "url-test", "load-balance", "sticky-sessions", "PROXY_GROUPS",
        "手动选择", "自动选择", "故障转移", "低倍率节点",
        "STATIC_RESOURCES", "FINANCE", "BILIBILI", "TRUTH_SOCIAL",
        "SOGOU_INPUT", "PIKPAK", "EHENTAI", "WEIBO",
    ]
    for token in forbidden:
        if token in output:
            raise ValueError(f"Unused or automatic policy code remains: {token}")
    for name in re.findall(r"function ([A-Za-z_$][A-Za-z0-9_$]*)\(", output):
        if name != "main" and len(re.findall(rf"\b{re.escape(name)}\b", output)) < 2:
            raise ValueError(f"Unreferenced function: {name}")
    options = jsbeautifier.default_options()
    options.indent_size = 2
    options.indent_chained_methods = True
    options.wrap_line_length = 100
    options.preserve_newlines = True
    options.max_preserve_newlines = 2
    options.end_with_newline = True
    return jsbeautifier.beautify(output, options)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check source/output consistency")
    args = parser.parse_args()
    result = build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != result:
            raise SystemExit("Override.js is out of date; run python scripts/build-override.py")
        print("mihomo/Override.js matches manual policies + regions + runtime + DNS")
    else:
        OUTPUT.write_text(result, encoding="utf-8", newline="\n")
        print(f"Built {OUTPUT.name}")
