# Mihomo 配置覆写

[Override.js](../mihomo/Override.js) 将上游分流规则、Emby 补充规则及自定义 DNS 合并为一个独立脚本。

## 使用方法

在原来加载 `convert.min.js` 的配置覆写入口中，改用 [Override.js 的 Raw 地址](https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/mihomo/Override.js)，并移除原来分别加载的 `convert.min.js`、Emby 补充脚本和 DNS YAML。

脚本通过 `main(config)` 接收带有 `proxies` 数组的 Mihomo 配置。Sub-Store 中的节点重命名仍使用单独的 `operator(proxies)` 操作，参见[节点重命名文档](./substore.md)。

合并脚本的执行顺序：

1. 内嵌的 [convert.min.js](../mihomo/vendor/powerfullz/convert.min.js) 生成分组、分流规则、嗅探和 TUN 设置。
2. [Emby.js](../mihomo/src/Emby.js) 添加 Emby 分组及规则集，并将 Emby 规则插入 GFWList 等兜底规则之前。
3. [dns.yaml](../mihomo/src/dns.yaml) 的完整 `dns` 对象替换 DNS，不保留上游 fallback 或订阅中的 DNS 策略。

如果客户端会接管 DNS（如 Clash Party 的“控制 DNS 设置”），需关闭该设置，使脚本中的 DNS 生效。`dns.yaml` 仅含 DNS，TUN 仍由上游逻辑和 `tun` 参数控制。

## 参数

Sub-Store 脚本链接可以追加参数，例如：

```text
https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/mihomo/Override.js#grouptype=1&threshold=2&tun=true
```

`grouptype`、`threshold`、`regex`、`quic`、`tun`、`full`、`keepalive` 等保留本地上游版本的行为。本地版本实际默认 `grouptype=1`、`threshold=2`，其文件头的默认值注释已过时。

DNS 严格使用自定义配置：

- `fakeip=false` 不会将 DNS 切换为 redir-host；当前配置为 fake-ip。
- `ipv6=true` 在生成完整配置时仍影响全局 IPv6；`dns.ipv6` 保持 YAML 中的 `false`。

## 维护

自定义来源位于 `mihomo/src/`。其中 `Emby.js` 是原来的 `Cloud.js`，文件名按用途调整。

上游文件位于 `mihomo/vendor/powerfullz/`。`convert.js` 是未压缩构建产物，`convert.min.js` 是压缩产物；真正的源码位于[上游项目](https://github.com/powerfullz/override-rules)的 `src/*.ts`。当前生成器使用本地 `convert.min.js`，上游更新需手动下载后重新生成。

在项目根目录执行：

```bash
python -m pip install PyYAML
python scripts/build-override.py
python scripts/build-override.py --check
node --check mihomo/Override.js
```

生成器读取上游脚本、Emby 脚本、DNS YAML 和上游授权声明，写入 `mihomo/Override.js`。生成文件含来源路径及内容校验值，使用成品不需要 Python。请修改来源文件后重新生成，避免直接修改生成文件。
