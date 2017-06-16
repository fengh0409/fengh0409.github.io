---
layout:     post
title:      "编写dockerfiles最佳实践（译）"
keywords:   "dockerfile,最佳实践,经验" 
description: "编写dockerfiles最佳实践"
date:       2017-04-06
published: true
catalog: true
tags:
    - docker 
---

Docker可以通过从`Dockerfile`读取指令来自动构建镜像，`Dockerfile`是一个包含构建给定镜像所需指令的文本文件，它遵循特定的格式并使用一组特定的指令。

## 一般准则和建议
#### 容器应该是短暂的
由`Dockerfile`定义的镜像生成的容器应尽可能短暂。对于“短暂”这个词，我们指的是容器可以被停止和销毁，并且使用最少的设置和配置来创建一个新的容器。如果你想了解在这样一个无状态方式下运行容器的机制，可以看看应用程序方法[12要素](https://12factor.net/zh_cn/)的Processes部分。

#### 使用`.dockerignore`
在大多数情况下，最好将`Dockerfile`放在一个空目录中，然后只添加`Dockerfile`构建镜像所需的文件。要提升构建的性能，你也可以添加一个`.dockerignore`文件到该目录来排除一些文件和目录，它的用法类似于`.gitignore`。

#### 避免安装不必要的包
为了减少镜像的复杂性、依赖性、大小和构建时间，你不应该为了方便使用而安装不必要的包。例如，在一个数据库镜像中安装VIM非常没有必要的。

#### 每个容器应该只有一个进程
将应用程序解耦到多个容器中可以更方便地对容器进行水平扩展和重用。例如，一个Web应用可能由三个独立的容器组成，每个容器都拥有自己的镜像，这种做法就是以解耦的方式来管理Web应用、数据库和缓存。

你可能已经听说`一个容器一个进程`的经验法则，虽然其意图很好，但并不是说每个容器只能有一个进程。事实上，除了可以使用init进程产生容器外，一些程序可能会自行产生其他的进程，例如，Apache可以根据每个请求来创建一个进程。通常来讲，`一个容器一个进程`是很好的经验法则，但不是固定死的，你应该根据自己的最佳的判断来保持容器尽可能干净、模块化。

如果容器之间相互依赖，你可以使用`Docker container networks`来确保容器之间可以互相通信。

#### 最小化镜像层
在编写`Dockerfile`时，你需要综合考虑`Dockerfile`文件的可读性（为了长期维护）和最小化镜像层数。

#### 对多行参数排序
在任何情况下，尽可能地通过首字母来排序多行参数，这可以让你避免安装重复的包，使得参数列表更容易维护。在反斜杠`\`前添加一个空格也会让`Dockerfile`更易阅读和review。

如下面的例子：
```ruby
RUN apt-get update && apt-get install -y \
    bzr \
    cvs \
    git \
    mercurial \
    subversion
```

#### 构建缓存
在构建镜像的过程中，Docker将按照指定的顺序逐步执行`Dockerfile`中的指令。每执行一条指令前，Docker都会在其缓存中查找是否有可重用的镜像，而不是创建一个新的（重复）镜像。如果你不想使用缓存，可以在`docker build`命令中使用`--no-cache = true`选项来强制重新构建。

但是，如果你确实要让Docker使用缓存，那么了解何时会找到匹配的镜像非常重要。 Docker查找镜像缓存时将遵循以下基本原则：
* 从已经存在缓存中的基础镜像开始，将下一个指令与从该基础镜像导出的所有子镜像进行比较，看其中是否有使用完全相同指令构建的子镜像，如果没有，则缓存无效。
* 在大多数情况下，只需将`Dockerfile`中的指令与其中一个子镜像比较即可，但是，某些指令需要更进一步的检测是否匹配。
* 对于`ADD`和`COPY`指令，将检查镜像中文件的内容，并计算每个文件的校验和，校验和的计算不包括文件的最后修改和最后访问时间。在查找镜像缓存时，将校验和与现有镜像的校验和进行比较，如果文件（如内容和元数据）中有任何变化，则缓存无效。
* 除了`ADD`和`COPY`指令，其他指令在查找缓存镜像时不会通过检查容器中的文件的方式来匹配缓存。例如，在处理`RUN apt-get -y update`命令时，将不会检查在容器中文件是否更新来确定是否命中缓存。在这种情况下，只需要通过检查命令字符串本身是否改变即可查找匹配的缓存。

注意：一旦缓存无效，则`Dockerfile`中所有后续的指令将不再使用缓存，而是重新生成新的子镜像。

## Dockerfile指令
接下来的内容是关于在`Dockerfile`中使用各个指令的最佳方式（只列出了一些有用的部分）。

#### FROM
尽可能的使用官方镜像作为基础镜像。

#### LABEL
你可以为镜像添加标签，这将为你按项目组织镜像、记录许可信息、自动化等起到帮助。每个标签可以添加一个以`LABEL`开头的行和一个或多个键值对。

> **注意：**如果你的字符串包含空格，那么你必须使用引号来包裹或者对空格进行转义，如果字符串内部包含引号，也要进行转义。

```ruby
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
通常来讲，为了使`Dockerfile`更易阅读、易于理解、容易维护，请使用反斜杠`\`将一行复杂的`RUN`命令分隔成多行。

#### APT-GET
`RUN`指令最常用的情形应该是应用程序的`apt-get`，在使用`RUN apt-get`命令安装软件包时，有几个地方需要注意一下。

你应该避免使用`RUN apt-get upgrade`或`dist-upgrade`，因为基础镜像中的许多必需软件包无法在无权限容器内升级。如果基础镜像中包含的软件包过期了，你应该联系该镜像的维护人员。如果你知道有一个特定的包需要更新，请使用`apt-get install -y`来自动更新。

请务必将`RUN apt-get update`与`apt-get install`组合在同一个`RUN`语句中，例如：
```ruby
RUN apt-get update && apt-get install -y \
    package-bar \
    package-baz \
    package-foo
```

在`RUN`语句中单独使用`apt-get update`会导致缓存问题，并且其后的`apt-get install`指令会失败。例如，假设你有这样一个`Dockerfile`文件：
```ruby
FROM ubuntu:14.04
RUN apt-get update
RUN apt-get install -y curl
```

构建镜像后，所有镜像层都已经缓存到Docker中，假设你以后要修改`Dockerfile`中的`apt-get install`来安装其他的包：
```ruby
FROM ubuntu:14.04
RUN apt-get update
RUN apt-get install -y curl nginx
```
Docker会把最初的`apt-get update`和修改后的`apt-get update`当做同样的指令，并且使用之前的缓存镜像，导致`apt-get update`不会执行，所以可能会安装比较旧的curl和nginx包版本。

而使用`RUN apt-get update && apt-get install -y`可确保安装的软件包版本是最新的，无需进一步的编码或手动干预，这种方式被称为`缓存破解`。你也可以通过一种叫做`版本锁定`的方式来指定包版本以达到同样的目的，例如：
```ruby
RUN apt-get update && apt-get install -y \
    package-bar \
    package-baz \
    package-foo=1.3.*
```
不论镜像缓存是否存在，`版本锁定`都会强制获取指定版本的包来构建镜像，这种方式还可以降低由于所需软件包的意外更改而导致构建失败的几率。

以下是一个良好格式的`RUN`指令示例：
```ruby
RUN apt-get update && apt-get install -y \
    aufs-tools \
    automake \
    build-essential \
    curl \
    dpkg-sig \
    libcap-dev \
    libsqlite3-dev \
    mercurial \
    reprepro \
    ruby1.9.1 \
    ruby1.9.1-dev \
    s3cmd=1.1.* \
&& rm -rf /var/lib/apt/lists/*
```

s3cmd指令指定了1.1.\*版本。如果镜像以前使用的是老版本，则指定新版本会让`apt-get update`镜像层缓存失效，并确保新版本的安装。

另外，通过删除`/var/lib/apt/lists`可以清理apt缓存，因此apt缓存不会存储于镜像层中，也就减小了镜像大小。由于`RUN`语句以`apt-get update`开头，所以在执行`apt-get install`之前，包缓存将始终被刷新。

#### CMD
`CMD`指令被用于运行包含在镜像中的软件和参数，它几乎总是以`CMD [“executable”, “param1”, “param2”…]`的形式调用。因此，对于服务类型的镜像，例如Apache和Rails，则可以这样运行`CMD [“apache2”，“-DFOREGROUND”]`。实际上，这种形式的指令也是推荐用于任何基于服务的镜像的。

在大多数情况下，应该给`CMD`一个交互式的shell，如bash，python和perl。例如，`CMD ["perl", "-de0"]`, `CMD ["python"]`或`CMD [“php”, “-a”]`，使用这种形式就意味着当你执行像`docker run -it python`这样的操作时，进入容器后将处于可用的shell中。尽量不要将`CMD`以`CMD [“param”，“param”]`的形式与`ENTRYPOINT`一起使用，除非你非常熟悉`ENTRYPOINT`的工作原理。

#### EXPOSE
`EXPOSE`指令指明容器将监听用于连接的端口，因此，你应该为应用程序使用通用的、默认的端口，例如，包含Apache web服务器的镜像应该使用`EXPOSE 80`，而包含MongoDB的镜像应该使用`EXPOSE 27017`等。

#### ADD或COPY
虽然`ADD`和`COPY`在功能上相似，但通常优先使用`COPY`，因为它比`ADD`更直观。`COPY`只支持将本地文件复制到容器中，而`ADD`具有一些隐藏的功能（如本地的tar提取和远程URL支持），因此，`ADD`最适合用于将本地tar文件自动提取到镜像中，如`ADD rootfs.tar.xz /`。

如果你的`Dockerfile`需要使用上下文中的多个文件，请单独使用`COPY`多次，而不是一次`COPY`，因为如果指定的文件更改了，这可以确保每一步的构建缓存失效（即强制重新构建）。

由于镜像大小很重要，因此不应该使用`ADD`从远程URL获取包，而应该用`curl`或`wget`来代替，这样你就可以删除在解压后不再需要的文件，也就不会在镜像中添加另一个镜像层。例如，你不应这样做：
```ruby
ADD http://example.com/big.tar.xz /usr/src/things/
RUN tar -xJf /usr/src/things/big.tar.xz -C /usr/src/things
RUN make -C /usr/src/things all
```
而应该使用下面的方式来代替：
```ruby
RUN mkdir -p /usr/src/things \
    && curl -SL http://example.com/big.tar.xz \
    | tar -xJC /usr/src/things \
    && make -C /usr/src/things all
```

对于不需要用到`ADD`自动提取功能的一些项目（如文件，目录），应该始终使用`COPY`指令。

#### USER
如果一个服务可以在无特定权限下运行，请使用`USER`指令来切换到非root用户，如果要创建用户和组，在`Dockerfile`中请使用`RUN groupadd -r postgres && useradd -r -g postgres postgres`的形式来创建。

你应该避免安装或使用`sudo`，因为一些无法预期的行为可能会导致更多问题。如果你确实要使用类似于`sudo`的功能（例如，以root用户身份初始化守护程序，但以非root身份运行），则可以使用`gosu`。

最后，为了减少镜像层和复杂性，不要频繁地使用`USER`切换用户。

#### WORKDIR
为了清晰和可靠，`WORKDIR`应该始终使用绝对路径，而且，你应该使用`WORKDIR`来切换目录，而不是像`RUN cd ... && do-something`这些难以阅读和维护的命令。

本文译自官方文档：[Best practices for writing Dockerfiles](https://docs.docker.com/engine/userguide/eng-image/dockerfile_best-practices/)，译者水平有限，有翻译差错请指正。

（完）
