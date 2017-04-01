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
为了减少复杂性、依赖性、文件大小和构建时间，你应该避免安装额外的或不必要的包，即使装了某个包会更好。例如，你不需要在一个数据库镜像中安装VIM。

#### 每个容器应该只有一个关注点
将应用程序解耦到多个容器中可以更方便地对容器进行水平扩展和重用。例如，一个Web应用可能由三个独立的容器组成，每个容器都拥有自己的镜像，这就是以解耦方式来管理Web应用，数据库和缓存。

你可能已经听说`一个容器一个进程`的经验法则，虽然其意图很好，但并不是说每个容器只能有一个进程。事实上，除了容器可以被init进程生成外，一些程序可能会自行产生其他的进程。例如，Celery可以产生多个进程，Apache也可以根据每个请求来创建一个进程。通常来讲，`一个容器一个进程`是很好的经验法则，但它不是固定的，你应该根据自己的最佳判断来保持容器尽可能干净、模块化。

如果容器之间相互依赖，你可能使用`Docker container networks`来确保容器之间可以通信。

#### 最小化镜像层
在编写dockerfile时，你需要综合考虑`Dockerfile`文件可读性（为了长期维护）和最小化镜像层数。

#### 对多行参数排序
无论什么时候，尽可能地通过首字母来排序多行参数，这会让你避免安装重复的包，使得参数列表更容易来维护。在反斜杠`\`前添加一个空格，也将让dockerfile更易阅读和review。

下面有个例子：
```
RUN apt-get update && apt-get install -y \
    bzr \
    cvs \
    git \
    mercurial \
    subversion
```
#### 构建缓存
在构建镜像的过程中，Docker将按照指定的顺序逐步执行Dockerfile中的指令。随着每条指令的检查，Docker将在其缓存中查找可以重用的现有镜像，而不是创建一个新的（重复）镜像。如果你不想使用缓存，可以在`docker build`命令中使用`--no-cache = true`选项。

但是，如果你确实要让Docker使用其缓存，那么了解何时会找到匹配的镜像是非常重要的。 Docker查找镜像缓存时将遵循以下基本原则：
* 从已经存在缓存中的基础镜像开始，将下一个指令与从该基础镜像导出的所有子镜像进行比较，看其中是否有使用完全相同指令构建的子镜像，如果没有，则缓存无效。
* 在大多数情况下，只需将`Dockerfile`中的指令与其中一个子镜像比较即可。但是，某些指令需要更多的检查和解释。
* 对于`ADD`和`COPY`指令，将检查镜像中文件的内容，并计算每个文件的校验和，在这些校验和中不考虑文件的最后修改时间和最后访问时间。在查找镜像缓存时，将校验和与现有镜像的校验和进行比较，如果文件（如内容和元数据）中有任何变化，则缓存无效。
* 除了`ADD`和`COPY`命令以外，检查缓存时将不会查看容器中的文件来确定缓存是否匹配。例如，在处理`RUN apt-get -y update`命令时，将不会检查在容器中更新的文件来确定是否命中缓存。在这种情况下，只需要通过命令字符串本身来查找匹配的缓存。

一旦缓存无效，则所有后续的Dockerfile指令将不再使用缓存，而是重新生成新的子镜像。

## Dockerfile指令
接下来的内容是关于在Dockerfile中使用各个指令的最佳方式。

#### FROM
尽可能的使用官方镜像作为你的基础镜像，

#### LABEL
你可以为镜像添加标签，这有助于你按项目组织图像、记录许可信息、自动化或其他原因。对于每个标签，添加一个以LABEL开头的行和一个或多个键值对。
> **注意：**如果你的字符串包含空格，那么你必须使用引号来包裹或者对空格进行转义，如果字符串内部包含引号，也要进行转义。
```
# 设置一个或多个标签
LABEL com.example.version="0.0.1-beta"
LABEL vendor="ACME Incorporated"
LABEL com.example.release-date="2015-02-12"
LABEL com.example.version.is-production=""

# 在一行设置设置多个标签
LABEL com.example.version="0.0.1-beta" com.example.release-date="2015-02-12"

# 一次设置多个标签，使用`\`符号来连接
LABEL vendor=ACME\ Incorporated \
      com.example.is-beta= \
      com.example.is-production="" \
      com.example.version="0.0.1-beta" \
      com.example.release-date="2015-02-12"
```

#### RUN
