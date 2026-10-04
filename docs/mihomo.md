# Mihomo 配置覆写

[Override.js](../mihomo/Override.js) 将上游分流规则、Emby 补充规则及自定义 DNS 合并为一个独立脚本。

## 使用方法

在原来加载 `convert.min.js` 的配置覆写入口中，改用 [Override.js 的 Raw 地址](https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/mihomo/Override.js)，并移除原来分别加载的 `convert.min.js`、Emby 补充脚本和 DNS YAML。

脚本通过 `main(config)` 接收带有 `proxies` 数组的 Mihomo 配置。Sub-Store 中的节点重命名仍使用单独的 `operator(proxies)` 操作，参见[节点重命名文档](./substore.md)。

合并脚本的执行顺序：

1. 内嵌的 [convert.js](../mihomo/vendor/powerfullz/convert.js) 生成分组、分流规则、嗅探和 TUN 设置。
2. [Emby.js](../mihomo/src/Emby.js) 添加 Emby 分组及规则集，并将 Emby 规则插入 GFWList 等兜底规则之前。
3. [Policies.js](../mihomo/src/Policies.js) 调整策略组、候选出口和分流顺序；[Regions.js](../mihomo/src/Regions.js) 重建国家组。
4. [dns.yaml](../mihomo/src/dns.yaml) 的完整 `dns` 对象替换 DNS，不保留上游 fallback 或订阅中的 DNS 策略。

如果客户端会接管 DNS（如 Clash Party 的“控制 DNS 设置”），需关闭该设置，使脚本中的 DNS 生效。`dns.yaml` 仅含 DNS，TUN 仍由上游逻辑和 `tun` 参数控制。

## 参数

Sub-Store 脚本链接可以追加参数，例如：

```text
https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/mihomo/Override.js#grouptype=1&threshold=1&tun=true
```

`grouptype` 默认 `1`：国家组自动测速；`0` 为手动选择，`2` 为 sticky-sessions 负载均衡。删除的是名为「自动选择」「故障转移」的全局组，国家组仍遵循 `grouptype`。

国家组的 `threshold` 默认改为 `1`，一个节点即可显示；显式设置 `threshold=2` 仍要求至少两个节点。国家组从当前 `proxies` 生成明确的节点列表，更新订阅时重新识别，不受 `regex` 参数影响；其他上游组的 `regex` 行为保留。`quic`、`tun`、`full`、`keepalive` 仍沿用上游。

DNS 严格使用自定义配置：

- `fakeip=false` 不会将 DNS 切换为 redir-host；当前配置为 fake-ip。
- `ipv6=true` 在生成完整配置时仍影响全局 IPv6；`dns.ipv6` 保持 YAML 中的 `false`。

## 维护

### 自定义策略

移除的策略组及其流量去向：

| 原策略组 | 调整后的去向 |
| --- | --- |
| 静态资源、金融服务、Truth Social、PikPak网盘、E-Hentai | 选择代理 |
| 哔哩哔哩、新浪微博、搜狗输入法 | DIRECT |
| 自动选择、故障转移 | 删除分组，并清理候选列表中的引用 |

新增 PayPal、游戏平台、Meta、Discord。规则使用 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) 的 `paypal`、`category-games`、`meta`、`discord` 分类。游戏平台是游戏相关域名的集合，包含 Steam、Epic、EA、育碧等；`category-games@cn` 和原有 SteamFix 优先直连，Xbox 的独立规则优先于游戏平台大分类。域名分流不等同于游戏加速器。

具体业务规则优先于静态 CDN；三份静态资源规则保留在 GFWList 之前，统一交给「选择代理」。

Final 可以选择「选择代理」、所有显示的国家组、可用的落地/低倍率组、手动选择、DIRECT，以及订阅中的每个节点。避免加入业务组和 GLOBAL，防止循环引用。

排列顺序为：选择代理、Final、AI、Emby → 香港/台湾/新加坡/日本/韩国/美国 → 媒体、社交、支付、游戏及厂商服务 → 荷兰等其他地区 → 手动选择、链式代理、广告拦截等辅助组。没有节点的国家组不显示。

### 国家识别

支持 61 个国家与地区，包含荷兰、瑞士、瑞典、挪威、西班牙、意大利、新西兰、巴西、阿联酋等。识别优先级为旗帜 → 国家/城市名称（较长名称优先）→ 独立国家代码，支持 `🇳🇱`、`荷兰`、`Netherlands`、`Amsterdam`、`AMS`、`NL01`、`nl_01` 等写法。`in`、`it`、`no` 等易与普通英文混淆的短代码要求大写或带编号。

识别依据是节点名称，不探测真实出口；名称完全不含地区信息的节点仍可从「手动选择」和 Final 直接选择。链式代理开启时，落地节点不进入前置代理引用的国家组。

### 重新生成

自定义来源位于 `mihomo/src/`。其中 `Emby.js` 是原来的 `Cloud.js`，文件名按用途调整。

上游文件位于 `mihomo/vendor/powerfullz/`。`convert.js` 是未压缩构建产物，`convert.min.js` 是压缩产物；真正的源码位于[上游项目](https://github.com/powerfullz/override-rules)的 `src/*.ts`。生成器使用可读的 `convert.js`，保留有含义的函数名和变量名，再统一排版。上游更新需手动下载后重新生成。

在项目根目录执行：

```bash
python -m pip install -r scripts/requirements.txt
python scripts/build-override.py
python scripts/build-override.py --check
node --check mihomo/Override.js
```

生成文件按“配置入口 → 自定义 DNS → Emby 分组与规则 → 自定义策略与国家识别 → 上游分流”排列，统一使用两个空格缩进。DNS 按用途分段，上游代码保留模块标记；授权全文放在 `mihomo/vendor/powerfullz/LICENSE`，脚本头部只保留简短来源说明。

生成器读取上游脚本、自定义策略、国家识别、Emby 和 DNS YAML，写入并格式化 `mihomo/Override.js`。`--check` 检查内容和排版是否与来源一致。使用成品不需要 Python；请修改来源文件后重新生成，避免直接修改生成文件。
