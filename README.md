# Kosuzu

面向 Sub-Store、Mihomo 的个人脚本与配置集合，包含节点重命名、分流覆写和 DNS 配置。

## 使用入口

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| [NodeRename.js](./substore/NodeRename.js) | 探测真实出口并重命名节点 | 国家、ASN、IP 类型与原生/广播信息；[使用文档](./docs/substore.md#noderename) |
| [CloudRename.js](./substore/CloudRename.js) | 根据名称及元数据重命名节点 | 本地识别地区、线路、等级和倍率；[使用文档](./docs/substore.md#cloudrename) |
| [Override.js](./mihomo/Override.js) | Mihomo 配置覆写 | 手动策略组、国家识别、Emby 与自定义 DNS；[使用文档](./docs/mihomo.md) |

可直接复制文件内容，或在支持远程脚本的客户端中使用下列 Raw 链接：

- [NodeRename.js](https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/substore/NodeRename.js)
- [CloudRename.js](https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/substore/CloudRename.js)
- [Override.js](https://raw.githubusercontent.com/Elainaicey/Kosuzu/main/mihomo/Override.js)

Sub-Store 节点重命名使用 `operator(proxies)`；Mihomo 配置覆写使用 `main(config)`。按所需功能选择对应的操作入口。

## 项目结构

```text
Kosuzu/
├── substore/                 # 可直接使用的节点处理脚本
│   ├── NodeRename.js
│   └── CloudRename.js
├── mihomo/
│   ├── Override.js           # 可直接使用的合并覆写
│   └── LICENSE              # 基础规则的来源许可证
└── docs/                     # 详细使用与维护说明
    ├── substore.md
    └── mihomo.md
```

## 更新覆写

直接修改 `mihomo/Override.js`。策略组、国家识别、Emby、DNS 和运行设置在同一个文件内按章节排列，无需构建。保存并推送后，在客户端更新已绑定的覆写并重新应用订阅。

## 本地检查

```bash
node --check substore/NodeRename.js
node --check substore/CloudRename.js
node --check mihomo/Override.js
```

## 来源

Mihomo 覆写基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules)，保留其 [MIT License](./mihomo/LICENSE)。自定义 DNS 已完整合并到 `Override.js` 的 `createCustomDns()` 中。
