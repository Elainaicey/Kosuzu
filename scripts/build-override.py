"""Build and format the standalone Mihomo override."""

import argparse
import json
import re
from pathlib import Path
from textwrap import indent

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


def render_upstream(source):
    """Use descriptive upstream names, with a single concise header in the output."""
    source = re.sub(r"\A\s*/\*![\s\S]*?\*/\s*", "", source, count=1)
    sections = {
        "utils": "通用工具",
        "constants": "地区与分组定义",
        "args": "参数解析",
        "proxy_groups": "代理组生成",
        "node_parser": "节点识别",
        "rules": "分流规则",
        "rule_providers": "规则集",
        "dns": "上游 DNS 与域名嗅探",
        "tun": "TUN 设置",
        "selectors": "代理候选列表",
        "main": "上游配置入口",
    }
    for module, label in sections.items():
        source = source.replace(f"// src/{module}.ts", f"// {label} · src/{module}.ts")
    return indent(source.strip(), "  ")


def build():
    upstream = (MIHOMO / "vendor/powerfullz/convert.js").read_text(encoding="utf-8-sig")
    cloud = (MIHOMO / "src/Emby.js").read_text(encoding="utf-8-sig")
    dns_source = (MIHOMO / "src/dns.yaml").read_text(encoding="utf-8-sig")
    data = yaml.safe_load(dns_source)
    if not isinstance(data, dict) or set(data) != {"dns"}:
        raise ValueError("dns.yaml must contain only a top-level dns section")
    if not isinstance(data["dns"], dict):
        raise ValueError("dns.yaml: dns must be an object")
    # The bundled upstream exports its entry through globalThis.main.
    # Capture that export privately so it cannot replace the combined entry.
    if upstream.count("globalThis.main=") + upstream.count("globalThis.main =") != 1:
        raise ValueError("Upstream export changed; review its entry before rebuilding")
    if cloud.count("function main(config)") != 1:
        raise ValueError("Emby.js entry changed; review it before rebuilding")
    cloud_body = cloud[cloud.index("function main(config)"):].replace(
        "function main(config)", "function applyCloudOverrides(config)", 1
    ).strip()
    output = f'''/**
 * Kosuzu · Mihomo 配置覆写
 *
 * 执行顺序：上游分流 → Emby 补充 → 自定义 DNS。
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

function main(config) {{
  const result = applyCloudOverrides(powerfullzOverrideMain(config));
  result.dns = createCustomDns();
  return result;
}}

// -----------------------------------------------------------------------------
// 自定义 DNS · mihomo/src/dns.yaml
// -----------------------------------------------------------------------------

// 每次创建独立对象，完整替换上游 DNS。
function createCustomDns() {{
{render_dns(data["dns"])}
}}

// -----------------------------------------------------------------------------
// Emby 分组与规则 · mihomo/src/Emby.js
// -----------------------------------------------------------------------------

{cloud_body}

// -----------------------------------------------------------------------------
// 上游分流 · mihomo/vendor/powerfullz/convert.js
// -----------------------------------------------------------------------------

const powerfullzOverrideMain = (() => {{
  const globalThis = {{}};

{render_upstream(upstream)}

  return globalThis.main;
}})();

globalThis.main = main;
'''
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
        print("mihomo/Override.js matches convert.js + Emby.js + dns.yaml")
    else:
        OUTPUT.write_text(result, encoding="utf-8", newline="\n")
        print(f"Built {OUTPUT.name}")
