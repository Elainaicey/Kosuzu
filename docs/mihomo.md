# Mihomo 配置覆写

[Override.js](../mihomo/Override.js) 直接生成最终策略组、分流规则、Emby、嗅探、TUN 与 DNS 配置。所有策略组的类型固定为 `select`，由用户选择出口；`profile.store-selected` 保存选择结果。

## 使用方法

[Override.js 的 Raw 地址](https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/mihomo/Override.js)。当前版本为 `1.0.1`。

Clash Party / Sparkle 中，将此地址添加为远程 **JS 覆写**，并将其绑定到当前订阅；更新覆写后重新应用该订阅。只更新 GitHub 文件不会自动改变已经生成的订阅 YAML。

如果通过 Sub-Store 生成完整配置文件，需要重新执行文件处理脚本，再在客户端更新订阅。节点重命名仍使用 `operator(proxies)`，覆写使用 `main(config)`，参见[节点重命名文档](./substore.md)。

如果客户端接管 DNS，需关闭「控制 DNS 设置」，使脚本内的 DNS 配置生效。

## 策略组

顶部顺序固定为：

**选择代理 → 备选代理 → Final → 美国 → 香港 → 日本 → 新加坡 → 台湾 → 韩国**。

没有节点的国家组自动跳过。后续服务按用途排列：

| 用途 | 顺序 |
| --- | --- |
| AI、影音 | AI服务、Emby服、Netflix、Youtube、巴哈姆特、Twitch、Spotify |
| 社交 | Telegram、Discord、Meta、Twitter、TikTok |
| 游戏 | 游戏平台、Xbox |
| 开发与厂商 | Github、谷歌服务、微软服务、苹果服务 |
| 支付 | PayPal、加密货币 |

其他地区优先排列英国、德国、荷兰、加拿大、法国、澳大利亚；辅助组放在最后。Meta 使用 [Dashboard Icons 的 Meta 图标](https://github.com/homarr-labs/dashboard-icons/blob/main/png/meta.png)。

「选择代理」以 DIRECT 开头，后面为可用的落地组和国家组，不包含「备选代理」。「备选代理」以 DIRECT 开头，后面为订阅中的全部节点。Final 的前三项固定为「选择代理 → 备选代理 → DIRECT」，后面为所有显示的国家组和可用的落地组，不直接列出单个节点。国家组中直接列出对应节点，允许逐个选择。

服务策略组的候选项前两位固定为「选择代理 → 备选代理」。服务原有的优先出口（例如巴哈姆特的台湾节点）排在这两项之后。

不生成自动测速、负载均衡、故障转移或低倍率分组。旧链接中的 `grouptype`、`loadbalance`、`regex` 不再控制组的行为。

## 分流与 DNS

移除独立策略组后，仍有用的域名规则直接指定出口：

| 规则用途 | 去向 |
| --- | --- |
| 静态资源、金融、Truth Social、PikPak、E-Hentai | 选择代理 |
| 哔哩哔哩、微博、搜狗输入法 | DIRECT |

PayPal、Meta、Discord、游戏平台使用 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) 中的分类。游戏平台包含 Steam、Epic、EA、育碧等域名；SteamFix 和 `category-games@cn` 优先直连，Xbox 仍由独立策略组控制。域名分流不等同于游戏加速器。

具体业务优先于静态 CDN，CDN 位于 GFWList 之前。所有下载的规则集均有对应分流规则。

实际引用的规则来源如下，表中未列出的库没有直接接入：

| 来源 | 使用内容 |
| --- | --- |
| MetaCubeX/meta-rules-dat | GeoSite、GeoIP：服务分类、国内与私有 IP；DNS 的国内域名分类 |
| powerfullz/override-rules | TikTok、EHentai、Weibo、SteamFix、FCM、AdditionalFilter、AdditionalCDNResources |
| SukkaW/Surge | Clash 格式的搜狗输入法、域名 CDN、非 IP CDN 规则 |
| 666OS/rules | Emby 域名与 IP 规则 |
| 217heidai/adblockfilters | Mihomo Lite 广告过滤 |
| Loyalsoldier/clash-rules | GFWList |

HTTP 规则集的更新间隔为 24 小时；Geo 数据自动更新由客户端设置控制。规则内容更新不会改变策略组或手动选择方式。

自定义 DNS 完整保存在 `Override.js` 的 `createCustomDns()` 中，不继承输入配置的 DNS；保持 fake-ip 和 `dns.ipv6: false`。TUN 独立控制。

## 参数与地区识别

Sub-Store 链接可追加参数，例如：

```text
https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/mihomo/Override.js#threshold=1&tun=true
```

支持 `threshold`、`quic`、`tun`、`full`、`ipv6`、`keepalive`。默认 `threshold=1`，一个节点即可显示国家组；显式设置 `threshold=2` 则要求至少两个节点。布尔参数默认关闭。`full=true` 生成完整基础设置；`ipv6` 和 `keepalive` 影响完整配置，DNS 始终使用自定义对象中的值。

支持 61 个国家与地区，识别优先级为旗帜 → 较长的国家/城市名称 → 独立代码。荷兰支持 `🇳🇱`、`荷兰`、`荷蘭`、`Netherlands`、`Amsterdam`、`AMS`、`NL01`、`nl_01` 等写法。`in`、`it`、`no` 等易与普通英文混淆的短代码要求大写或带编号。

识别依据是名称，不探测真实出口。没有地区信息的节点仍可从「备选代理」选择，也可通过 Final 中的「备选代理」间接选择。链式代理启用时，落地节点不进入前置代理引用的国家组。

`CN2` 只作为线路标签，不识别为中国节点；多个国旗按名称中首次出现的国旗识别。生成配置时检查节点重名、与策略组重名、缺失引用和循环引用；出现问题会报告对应名称，避免生成无法使用的配置。

## 维护

直接维护 [Override.js](../mihomo/Override.js)，所有内容按章节排列：

| 内容 | 修改位置 |
| --- | --- |
| DNS | `createCustomDns()` |
| 服务组与图标 | `KOSUZU_SERVICES` |
| 策略组候选与顺序 | `createKosuzuGroups()` |
| 分流规则与规则源 | `createKosuzuRules()`、`createKosuzuProviders()` |
| 国家识别与顺序 | `KOSUZU_REGIONS`、`KOSUZU_REGION_ORDER` |
| Emby 规则 | 并入 `createKosuzuProviders()`、`createKosuzuRules()` |
| 参数、嗅探、TUN | `createKosuzuOptions()`、`createKosuzuRuntime()` |

基础规则参考 [powerfullz/override-rules](https://github.com/powerfullz/override-rules)，保留其 [MIT 许可证](../mihomo/LICENSE)。上游更新不会自动改写本项目的分组逻辑，远程规则集仍按配置更新。

```bash
node --check mihomo/Override.js
```

保存文件并推送后，在客户端更新覆写并重新应用订阅。项目不再保留重复来源文件、生成器或构建依赖。
