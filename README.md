# Tech-Docs 个人知识管理系统

静态站点 + Git 同步的 Markdown 知识库。网站前端只负责读取 `index.json` 和文档正文，内容本体统一维护在 `Tech-Docs/` 中。

## 当前结构

```text
/www/wwwroot/yanglei.asia/
├── index.html                      # 首页
├── docs.html                       # 文档列表页
├── doc.html                        # 文档阅读页
├── 404.html                        # 404 页面
├── generator-new.py                # 索引生成器
├── index.json                      # 生成后的索引
├── webhook.php                     # GitHub Webhook 接收器
├── webhook-processor.sh            # Webhook 处理脚本
├── config/
│   └── user-info.json              # 首页资料卡配置
├── assets/
│   ├── css/
│   │   ├── base.css                # 共享样式、交互、动效
│   │   ├── home.css                # 首页专用样式
│   │   ├── docs.css                # 文档列表页专用样式
│   │   └── doc.css                 # 阅读页专用样式
│   └── js/
│       ├── core/
│       │   ├── data-service.js     # 数据读取和树结构工具
│       │   ├── dom.js              # 通用 DOM / 格式化工具
│       │   ├── markdown.js         # Markdown 渲染与净化
│       │   └── motion.js           # 共享动效与过渡
│       └── pages/
│           ├── home-page.js        # 首页逻辑
│           ├── docs-page.js        # 文档列表页逻辑
│           └── doc-page.js         # 阅读页逻辑
└── Tech-Docs/                      # 文档仓库
```

## 工作流

1. 在 `Tech-Docs/` 中新增或修改 Markdown 文档。
2. 运行 `python3 generator-new.py` 更新索引。
3. 浏览器刷新页面，前端会从新的 `index.json` 读取分类和文档元数据。

## 生成器行为

- 生成器只按 `UTF-8` 读取 Markdown 文档。
- 遇到非 `UTF-8` 文件时会记录警告并跳过该文档，其余文档继续生成索引。

- Linux 服务器可按默认路径运行。
- 如果将目录部署到其他位置，可通过环境变量覆盖：

```bash
TECH_DOCS_REPO=/custom/path/Tech-Docs \
TECH_DOCS_INDEX=/custom/path/index.json \
python3 generator-new.py
```

## 站点约束

- 网站界面不依赖 `data/` 目录中的旧内容。
- 阅读页只允许打开 `index.json` 中登记过的 `Tech-Docs/...` 文档路径。
- Markdown 渲染经过净化处理，避免把任意 HTML 直接注入页面。

## 运行依赖

- Python 3
- 浏览器网络可访问 CDN 资源：
  - Tailwind CSS
  - Font Awesome
  - Highlight.js
  - Marked.js
