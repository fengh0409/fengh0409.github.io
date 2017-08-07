---
layout:     post
title:      "git使用技巧"
keywords:   "git,skills,使用技巧" 
description: "git的使用技巧和一些注意的地方"
date:       2017-07-09
published:  true 
catalog: true
tags:
    - git 
---

有些东西一段时间不用就特别容易忘，最近在使用git的时候老是要去查文档，所以在这里记录git的一些用法，以方便以后查阅。

## .gitignore
.gitignore文件可以让你忽略本地文件或目录的改动，在第一次提交到远程git仓库前，将你要忽略的文件或目录路径添加到.gitignore就行了，然后git push到remote仓库。如：
```
cache/
log/
```
目录或文件路径都是相对.gitignore的路径。

但是，如果我们第一次并没有提交.gitignore，而是在以后加入该文件，我们会发现忽略的文件或目录改动后，git status照样会显示其已修改，这时候我们需要将本地缓存删除并重新提交才会生效：
```bash
git rm -r --cached .
git add --all
git commit -m 'delete cache'
git push
```

## git log
该命令用于查看提交历史记录

* `git log -p` 显示每次提交的差异对比，`git log -p -2`仅显示最近的两次更新
* `git log -stat` 显示修改的行数
* `git log --pretty=oneline` 单行显示历史提交记录
```
ca82a6dff817ec66f44342007202690a93763949 changed the version number
085bb3bcb608e1e8451d4b2432f8ecbe6306e7e7 removed unnecessary test code
a11bef06a3f659402fe7563abf99ad00de2209e6 first commit
```
* `git log --pretty=format:"%s"` 定制要显示的记录格式
```
git log --pretty=format:"%h - %an, %ar : %s"
ca82a6d - Scott Chacon, 11 months ago : changed the version number
085bb3b - Scott Chacon, 11 months ago : removed unnecessary test code
a11bef0 - Scott Chacon, 11 months ago : first commit
```

## 子模块
子模块在git中用的比较少，什么是子模块呢？比如我们有一个git项目A，而该项目又包含另一个git项目B，那么B就是A的子模块。

向一个项目添加一个子模块：`git submodule add yourGitUrl`，如：
```
git submodule add https://github.com/Seldaek/monolog.git
```
该命令会在当前目录clone monolog项目（也可以指定目录），并新增一个.gitmodules文件，该文件记录了所有子模块的信息。

当我们使用命令`git clone mainProjectUrl`clone含有子模块的项目时，子模块会被同时clone下来，但此时子模块的目录是空的，我们需要在`.gitmodule`所在目录做初始化操作并拉取子模块的代码：
```
git submodule init
git submodule update
```
这种方式比较繁琐，有个更简单的方法是加个`--recursive`参数：
```
git clone --recursive mainProjectUrl
```

进入到子模块所在目录，通过`git branch`发现当前本地分支是处于一个游离的分支，我们首先需要checkout到一个本地分支：`git checkout master`，因为处于游离分支时，代码将无法提交，然后通过`git submodule update --remote --merge`来更新代码，如果忘记--merge，Git 会将子模块更新为服务器上的状态，并且会将项目当前分支重置为一个游离的分支。

（待续）
