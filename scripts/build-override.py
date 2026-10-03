"""Build the standalone Mihomo override. Build dependency: PyYAML."""

import argparse
import hashlib
import json
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
MIHOMO = ROOT / "mihomo"
OUTPUT = MIHOMO / "Override.js"
LICENSE = (MIHOMO / "vendor/powerfullz/LICENSE").read_text(encoding="utf-8").strip()


def build():
    upstream = (MIHOMO / "vendor/powerfullz/convert.min.js").read_text(encoding="utf-8-sig")
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
    sources = {
        "mihomo/vendor/powerfullz/convert.min.js": upstream,
        "mihomo/src/Emby.js": cloud,
        "mihomo/src/dns.yaml": dns_source,
    }
    hashes = "\n".join(
        f" * {name} SHA256: {hashlib.sha256(source.encode('utf-8')).hexdigest()}"
        for name, source in sources.items()
    )
    dns_literal = json.dumps(data["dns"], ensure_ascii=False, indent=2, allow_nan=False)
    dns_literal = "\n".join("  " + line for line in dns_literal.splitlines())
    return f'''/**
 * Kosuzu Mihomo/Sub-Store 合并覆写：powerfullz + Emby + 自定义 DNS。
 * 上游项目：https://github.com/powerfullz/override-rules
 * 自动生成；更新来源文件后运行 python scripts/build-override.py。
 * 运行时仅需本文件，无需加载另外三个文件。
 * DNS 严格使用 mihomo/src/dns.yaml；fakeip 参数不改变 DNS，ipv6 仅影响上游全局设置。
 * grouptype、threshold、regex、quic、tun、full、keepalive 等仍交给上游处理。
{hashes}
 */
/*!
{LICENSE}
*/
"use strict";

const powerfullzOverrideMain = (() => {{
  const globalThis = {{}};
  // BEGIN embedded convert.min.js (unchanged)
{upstream.rstrip()}
  // END embedded convert.min.js
  return globalThis.main;
}})();

// mihomo/src/Emby.js 的补充逻辑，执行在上游生成配置之后。
{cloud_body}

// 每次创建新的 DNS 对象，完整替换上游 DNS，不保留其 fallback 或过滤列表。
function createCustomDns() {{
  return {dns_literal.lstrip()};
}}

function main(config) {{
  const result = applyCloudOverrides(powerfullzOverrideMain(config));
  result.dns = createCustomDns();
  return result;
}}

globalThis.main = main;
'''


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check source/output consistency")
    args = parser.parse_args()
    result = build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != result:
            raise SystemExit("Override.js is out of date; run python scripts/build-override.py")
        print("mihomo/Override.js matches convert.min.js + Emby.js + dns.yaml")
    else:
        OUTPUT.write_text(result, encoding="utf-8", newline="\n")
        print(f"Built {OUTPUT.name}")
