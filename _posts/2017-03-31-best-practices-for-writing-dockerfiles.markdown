---
layout:     post
title:      "编写dockerfiles最佳实践"
keywords:   "dockerfile,最佳实践,经验" 
description: "编写dockerfiles最佳实践"
date:       2017-03-31
published:  false
catalog: true
tags:
    - docker 
---

Docker可以通过dockerfile读取指令来自动构建镜像，它是一个包含构建给定镜像所需指令的文本文件。Dockerfiles遵循特定的格式并使用一组特定的指令。

## 一般准则和建议
#### 容器应该是短暂的
由Dockerfile定义的镜像生成的容器应尽可能短暂。对于“短暂”这个词，我们指的是容器可以被停止和销毁，并且使用最小的设置和配置来创建一个新的容器。你可能需要查看应用程序方法“12要素”的Processes部分，以了解在这样一个无状态方式运行容器的意义。

#### 使用`.dockerignore`
在大多数情况下，最好将dockerfile放在一个空目录中，然后，仅添加构建dockerfile所需的文件。要提升构建的性能，你也可以添加一个`.dockerignore`文件到该目录来排除文件和目录。这个文件的用法类似于`.gitignore`。

#### 避免安装不必要的包
为了减少复杂性、依赖性、文件大小和构建时间，你应该避免安装额外的或不必要的包，即使装了某个包会更好也不要安装。例如，你不需要在一个数据库镜像中安装VIM。
