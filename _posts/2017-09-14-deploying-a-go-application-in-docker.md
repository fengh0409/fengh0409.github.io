---
layout:     post
title:      "docker部署go应用"
keywords:   "go,interface,接口" 
description: "docker,go,deploy,部署"
date:       2017-09-14
published:  true 
catalog: true
tags:
    - go 
    - docker 
---

## 前言
因为go的应用就是一个可执行的二进制文件，所以使用docker部署go应用非常简单。

## 编写一个go应用
下面是一个打印Hello World的简单go应用：
```
//hello.go
package main

import (
    "fmt"
)

func main() {
    fmt.Println("Hello, World!")
}

```
执行`go build`编译生成可执行文件`hello`，这里要注意的是：**如果当前系统和拉取的镜像的系统不同，需要交叉编译。**比如我当前是在Mac下执行`go build`编译的，而我拉取的golang镜像是基于Linux的，启动容器时会发现go的二进制文件无法执行，所以要进行交叉编译：`GOOS=linux GOARCH=amd64 go build`，这里`GOOS=linux`表示编译到linux，`GOARCH=amd64`表示64位，如果镜像系统是32位，则`GOARCH=386`，更多信息请自行Google。

## 构建应用镜像
* 拉取golang基础镜像：`docker pull golang`

* 编写应用镜像的Dockerfile：

```
FROM golang

COPY ./hello /tmp/hello

WORKDIR /tmp/hello

RUN chmod +x hello
```

Dockerfile所在目录结构如下：
```
│── Dockerfile
│── hello
```

构建镜像：`docker build -t hello-image .`

## 运行应用
应用镜像构建后，启动容器，如下，会打印出`Hello, World!`，然后容器退出。
```
➜  docker run hello-image ./hello
Hello, World!
```
至此，一个简单的go应用就完成了，是不是很简单？不过，这并不是本文的重点。

## 最小化应用镜像
现在，我们来看看构建的应用镜像大小：
```
➜  docker images
REPOSITORY          TAG                 IMAGE ID            CREATED             SIZE
hello-image         latest              a494fa9e4699        35 hours ago        732 MB
golang              latest              1cdc81f11b10        3 days ago          728 MB
```
可以看到，构建的应用镜像很大，有730多MB，这对大多数镜像来说是无法接受的，更何况我们的应用仅仅是个Hello World。

由于我们拉取的基础镜像golang有728MB，导致构建的应用镜像非常大。而go应用是一个可执行的二进制文件，只需要一个系统而不需要其他的环境就可以跑起来了，所以这里我重新拉了一个叫做alpine的镜像。

```
➜  docker images
REPOSITORY          TAG                 IMAGE ID            CREATED             SIZE
hello-image         latest              a494fa9e4699        2 days ago          732 MB
golang              latest              1cdc81f11b10        4 days ago          728 MB
alpine              latest              76da55c8019d        5 days ago          3.97 MB
```

可以看到，alpine镜像的大小连4MB都不到，现在修改一下Dockerfile:

```
FROM alpine

COPY ./hello /tmp/hello

WORKDIR /tmp/hello

RUN chmod +x hello
```

**注意：这里Hello World应用的二进制文件要重新通过以下命令生成：`CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build`，和原来相比多了`CGO_ENABLED=0`**

然后我们删掉应用镜像再重新构建：`docker build -t hello-image .` ，执行以下命令启动容器：
```
➜  docker run hello-image ./hello
Hello, World!
```
可以正确打印`Hello World!`

现在看看新的应用镜像大小：
```
➜  docker images
REPOSITORY          TAG                 IMAGE ID            CREATED             SIZE
hello-image         latest              8371d9245aa3        26 seconds ago      7.08 MB
golang              latest              1cdc81f11b10        4 days ago          728 MB
alpine              latest              76da55c8019d        5 days ago          3.97 MB
```
新的应用镜像仅7.08MB，和原来的应用镜像相比，小了100倍！极大地节省了磁盘空间，这才是使用docker部署go应用的正确方式。

## 总结
那么，为什么编译基于alpine的应用镜像时要加上`CGO_ENABLED=0`呢？先说说golang基础镜像，因为它安装了go编译器，而go编译器又需要GCC和整个Linux发行版本，所以golang镜像才会这么大。而我们的go应用完全可以编译好了再构建到应用镜像里去，这样的话，应用镜像继承的基础镜像就不需要安装go编译器、GCC等其他的东西了。而alpine镜像仅仅包含Linux内核，所以我们的go应用在编译时要加上`CGO_ENABLED=0`来表明禁用CGO工具，否则go应用在容器中执行会出错。

（完）
