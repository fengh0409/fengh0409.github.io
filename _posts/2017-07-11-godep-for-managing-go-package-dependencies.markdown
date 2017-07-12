---
layout:     post
title:      "go的包管理工具godep和dep"
keywords:   "godep,dep,go包管理" 
description: "go的包管理工具，godep和dep"
date:       2017-07-11
published:  false 
catalog: true
tags:
    - go 
---

## 前言
目前go有两个包管理工具：godep和dep，godep是从go 1.0开始就可以使用了，而dep是go 1.7开始才能使用，godep是比较老的包管理工具，很早就用go的人可能都用过godep，而dep是比较新的，也是最可能被纳入官方的包管理工具。下面分别介绍下godep和dep的使用。

## godep
#### 安装
```
go get github.com/tools/godep
```
其可用命令有以下几个：
```
save     list and copy dependencies into Godeps
go       run the go tool with saved dependencies
get      download and install packages with specified dependencies
path     print GOPATH for dependency code
restore  check out listed dependency versions in GOPATH
update   update selected packages or the go version
diff     shows the diff between current and previously saved set of dependencies
version  show version info
```
#### 使用
```
godep save
```
该命令会在项目根目录下自动生成一个Godeps和一个vendor目录，它会将项目所依赖的第三方包信息写入Godeps/Godeps.json，并复制包源码到vendor目录，注意：该命令并不会自动从远程下载包，需要我们通过`go get`手动下载。

#### 例子
这里举个例子，其目录结构如下：
```
├── app
│   └── main.go
```
main.go源码：
```go
package main

import (
	"fmt"
	"github.com/shopspring/decimal"
)

func main() {
	price, err := decimal.NewFromString("136.204")
	if err != nil {
		panic(err)
	}
	fmt.Println(price.StringFixed(2))
}
```

这里我们导入了一个decimal包，通过`go get`下载下来后，执行`godep save`，查看项目目录结构：
```
├── Godeps
│   ├── Godeps.json
│   ├── Readme
│── vendor
│   └── github.com
│       └── shopspring
│          │── decimal.go
│          │── LICENSE
│          │── README.md
└── main.go
```

查看Godeps.json文件内容：
```json
{
    "ImportPath": "myapp",
    "GoVersion": "go1.8",
    "GodepVersion": "v79",
    "Deps": [
        {
            "ImportPath": "github.com/shopspring/decimal",
            "Rev": "16a941821474ee3986fdbeab535a68a8aa5a85d2"
        }
    ]
}

```

可以看到，该文件记录了项目所依赖的第三方包信息。

现在，我们在main.go中新增一个seelog包：
```go

```
## dep
#### 安装
