# GaryFeng 的个人博客

一个基于 Jekyll 的静态博客，主题源自 Hux Blog，并结合个人需求做了样式与功能调整。支持分页、标签云、代码高亮、SEO 元信息与百度/Google Analytics。

## 在线地址
- 主页：`http://fengh0409.github.io`

## 技术栈
- `Jekyll`（静态站点生成）
- `jekyll-paginate`（文章分页）
- `Rouge`（代码高亮）
- 前端：`Less`、`Bootstrap`、`jQuery`
- 构建工具：`Grunt`
- 统计：`Baidu Analytics`、`Google Analytics`

## 目录结构
- `_posts/` 文章内容，文件名形如 `YYYY-MM-DD-title.md`
- `_layouts/` 页面与文章布局模板
- `_includes/` 复用的局部模板（头部、导航、页脚等）
- `less/` 样式源文件
- `css/` 构建后的样式文件
- `js/` 站点脚本
- `img/` 图片资源
- `fonts/` 字体资源
- `_config.yml` Jekyll 全局配置
- `index.html` 文章列表页（含分页）
- `tags.html` 标签云与标签页列表
- `404.html` 404 页面
- `feed.xml` RSS Feed
- `Gruntfile.js` 前端构建配置
- `package.json` Node 开发依赖与脚本
- `LICENSE` 许可证

## 开发环境准备
- 安装 Ruby 与 Jekyll（推荐使用 RubyGems 安装）：
  - `gem install jekyll jekyll-paginate`
- 安装 Node.js 与 npm，并安装前端依赖：
  - 在项目根目录执行 `npm install`

## 本地运行与预览
- 构建前端资源：`grunt`
- 本地开发（监听 Less/JS、生成站点并预览）：`npm run watch`
  - 该脚本会同时：
    - 运行 `grunt watch` 监听并编译 `less/` 与 `js/`
    - 在 `_site/` 目录启动预览服务器（Python 2：`python -m SimpleHTTPServer 8020`）
    - 启动 `jekyll serve -w` 生成与监听站点内容
- 仅启动 Jekyll 预览：`jekyll serve`
  - 如使用 Python 3，可在另一终端运行：`python3 -m http.server 8020`（进入 `_site/` 目录）

## 写作指南（文章 Front Matter）
在 `_posts/` 中新增 Markdown 文件，文件名格式 `YYYY-MM-DD-title.md`，示例 Front Matter：

```yaml
---
layout:     post
title:      "文章标题"
keywords:   "关键字1,关键字2"
description:"文章摘要或描述"
date:       2025-01-01
published:  true
catalog:    true
tags:
  - tag1
  - tag2
---
```

常用字段说明：
- `layout` 使用的布局，文章为 `post`
- `title` 标题；`description` 摘要；`keywords` SEO 关键字
- `date` 发布时间；`published` 是否发布
- `catalog` 是否在侧边目录中显示
- `tags` 标签列表，用于 `tags.html` 聚合显示

## 配置说明（`_config.yml`）
- 站点信息：`title`、`SEOTitle`、`description`、`keyword`、`email`、`url`、`baseurl`
- 分页与高亮：`permalink: pretty`、`paginate: 10`、`highlighter: rouge`
- Markdown：`kramdown` 并启用 `GFM`
- 插件：`gems: [jekyll-paginate]`
- 统计：`ba_track_id`、`ga_track_id`、`ga_domain`
- 侧边栏：`sidebar`、`sidebar-about-description`、`sidebar-avatar`
- 标签配置：`featured-tags` 与 `featured-condition-size`

## 构建与发布
- 构建资源：`grunt` 或 `npm run watch`
- 推送到远程（示例脚本，按需调整）：
  - `npm run push` 将更新推送到 `origin master`（附带 tag）
- 本项目面向 GitHub Pages 部署，域名通过 `CNAME`（仓库设置）绑定到 `fengh0409.github.io`。

## 常用脚本（`package.json`）
- `preview`：进入 `_site/`，启动 `8020` 端口的预览服务器
- `watch`：并行运行 `grunt watch`、`preview` 与 `jekyll serve -w`
- `push`：推送到 `origin master` 并附带 tag

## 许可证
- 采用 `Apache-2.0`（见 `LICENSE`）
- 主题与子组件来源：
  - Hux Blog（Apache-2.0）
  - Clean Blog Jekyll Theme（MIT）

## 鸣谢
- Hux Blog 主题及其构建脚本
- 社区开源生态（Jekyll、Bootstrap、jQuery 等）
