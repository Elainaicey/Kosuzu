# Kosuzu

面向 Sub-Store、Mihomo 的个人脚本与配置集合，包含节点重命名、分流覆写和 DNS 配置。

## 使用入口

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| [NodeRename.js](./substore/NodeRename.js) | 探测真实出口并重命名节点 | 国家、ASN、IP 类型与原生/广播信息；[使用文档](./docs/substore.md#noderename) |
| [CloudRename.js](./substore/CloudRename.js) | 根据名称及元数据重命名节点 | 本地识别地区、线路、等级和倍率；[使用文档](./docs/substore.md#cloudrename) |
| [Override.js](./mihomo/Override.js) | Mihomo 配置覆写 | powerfullz 分流规则 + Emby + 自定义 DNS；[使用文档](./docs/mihomo.md) |

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
│   ├── src/                  # 自定义覆写来源
│   │   ├── Emby.js
│   │   └── dns.yaml
│   └── vendor/powerfullz/    # 上游构建产物和授权声明
│       ├── convert.js
│       ├── convert.min.js
│       └── LICENSE
├── scripts/
│   ├── build-override.py     # 生成并排版合并覆写
│   └── requirements.txt      # 构建依赖
└── docs/                     # 详细使用与维护说明
    ├── substore.md
    └── mihomo.md
```

## 更新覆写

修改 `mihomo/src/` 中的 Emby 或 DNS 配置，或更新 `mihomo/vendor/powerfullz/` 中的上游文件后，在项目根目录运行：

```bash
python -m pip install -r scripts/requirements.txt
python scripts/build-override.py
python scripts/build-override.py --check
```

客户端只需加载生成后的 `mihomo/Override.js`，运行时无需 Python，也无需单独加载来源文件。

## 本地检查

```bash
node --check substore/NodeRename.js
node --check substore/CloudRename.js
node --check mihomo/src/Emby.js
node --check mihomo/Override.js
```

## 来源

Mihomo 覆写基于 [powerfullz/override-rules](https://github.com/powerfullz/override-rules)，上游代码遵循 [MIT License](./mihomo/vendor/powerfullz/LICENSE)。自定义 DNS 使用 [mihomo/src/dns.yaml](./mihomo/src/dns.yaml)。
