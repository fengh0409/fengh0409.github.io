---
layout:     post
title:      "Git使用技巧"
keywords:   "git回滚,git clone,git log,git使用技巧,git子模块" 
description: "git的使用技巧和一些注意的地方"
date:       2017-07-09
published:  true 
catalog: true
tags:
    - git 
---

有些东西一段时间不用就特别容易忘，最近在使用git的时候老是要去查文档，所以在这里记录git的一些用法，以方便以后查阅。

## 回滚
对于已经push过的代码，回滚到某个版本，可以使用`git reset`和`git revert`两种方法。

例如：远程提交记录是`A -> B -> C -> D`，要回滚到B那个版本：
#### git reset
```
git reset --hard B
git push origin master --force
```
因为reset过的当前分支版本落后远程分支，普通的push操作无法提交，必须加上`--force`参数来强制提交。执行上述操作后，远程提交记录会变为`A -> B`，`C` 和 `D` 的提交记录会被直接删除。
#### git revert
```
git revert --hard B
git push origin master 
```
执行`git revert`后，不需要加`--force`强制提交，`git push`之后，远程提交记录会变为`A -> B -> C -> D -> E`，其中，版本`E`的操作就是回滚`C`和`D`的代码。

**总结：`git reset`会删除提交记录，对于确实不需要的历史记录使用`git reset`回滚可以使提交记录看起来更干净；而`git revert`会保留提交记录，可以保留整个分支的所有历史记录，方便以后再次回滚。具体使用哪个命令来回滚要根据实际使用场景。**

## 拉取远程新分支
以前我要拉一个远程分支到本地，一般是通过`git pull origin b1:b1`这种方式来拉的，直到有天出现问题了才发现，`git pull`拉取的分支会和当前本地分支合并，比如我现在在master分支，执行`git pull origin b1:b1`时，git会将b1合并到master，因为`git pull`相当于`git fetch`+`git merge`，而我们往往不希望他们进行合并操作。因此，应通过以下方式拉取分支：
```git
#拉取origin主机的b1分支
git fetch origin b1
#checkout到b1分支后，处于detached HEAD状态
git checkout origin/b1
#在origin/b1中新建本地b1分支，这样就把远程b1分支拉下来了
git checkout -b b1
```
更新本地分支也应使用上述方式：
```git
git fetch origin b1
git merge origin/b1
```
尽量少用`git pull`，虽然这很方便，但是容易出错。

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

## 配置和取消代理
```
git config --global https.proxy http://username:password@127.0.0.1:1080
git config --global https.proxy https://username:password@127.0.0.1:1080

# 或者
git config --global http.proxy socks5://127.0.0.1:1080
git config --global https.proxy socks5://127.0.0.1:1080

git config --global --unset http.proxy
git config --global --unset https.proxy
```


（待续）
