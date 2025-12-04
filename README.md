# GaryFeng 的个人博客

## 项目简介
这是一个纯静态的个人博客站点，使用 HTML/CSS/JS 构建，不依赖后端。文章内容存放在 `_posts/` 目录中，通过脚本生成 `data/posts.json`，页面在浏览器端渲染列表、详情和标签页。

## 快速启动
### 本地预览
1. 生成文章数据：
```
node scripts/build-posts-json.mjs
```
2. 启动静态服务器：
```
python3 -m http.server 8020
```
3. 打开浏览器访问：
```
http://localhost:8020/
```

### 目录结构（关键部分）
```
_posts/            Markdown 文章（带 YAML Front Matter）
data/posts.json    文章数据（由脚本生成）
index.html         首页（文章列表/详情）
tags.html          标签页（由 js/tags.js 渲染）
js/static-blog.js  列表与详情渲染逻辑
js/tags.js         标签云与标签列表渲染逻辑
css/               样式文件
img/               图片资源
vercel.json        Vercel 部署配置
```

## 写作与发布
### 新增文章
在 `_posts/` 新建 Markdown 文件，文件名建议遵循：
```
YYYY-MM-DD-slug.markdown
```
示例：
```
2025-12-01-my-new-post.markdown
```

文件内容需包含 YAML Front Matter，示例：
```
---
title: 我的新文章
date: 2025-12-01
author: Gary
tags:
  - go
  - docker
---

这里是 Markdown 正文内容...
```

保存后运行：
```
node scripts/build-posts-json.mjs
```
刷新首页即可看到更新。详情页的地址为：
```
/#<slug>
```
其中 `<slug>` 来自文件名中的 `slug`（如上例为 `my-new-post`）。

### 图片与资源
将图片放入 `img/` 子目录，正文中直接引用相对路径，如：
```
![说明](/img/your-image.png)
```

## 页面说明
- 首页：文章列表与详情切换（通过 URL hash 切换）。详情页右侧显示“文章目录”，并支持点击跳转到正文对应标题。
- 标签页：访问 `tags.html`，右侧菜单已有 `TAG` 链接。标签数据来源于文章 Front Matter 的 `tags` 字段。

## 脚本说明
```
scripts/build-posts-json.mjs
```
- 解析 `_posts/` 目录下文章的 Front Matter 与正文
- 生成并排序为 `data/posts.json`
- `date` 建议使用 `YYYY-MM-DD` 格式，脚本会转为 ISO 时间用于排序

## 部署
项目包含 `vercel.json`，可选用 Vercel 部署为静态站点。也可使用任意静态托管（GitHub Pages、Nginx 等）。

## 许可证
见 `LICENSE`
