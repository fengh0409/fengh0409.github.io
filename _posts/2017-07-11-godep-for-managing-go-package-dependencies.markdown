---
layout:     post
title:      "go的包管理工具godep和dep"
keywords:   "godep,dep,go包管理" 
description: "go的包管理工具，godep和dep"
date:       2017-07-11
published:  true 
catalog: true
tags:
    - go 
---

## 前言
目前go并没有官方的包管理工具，比较流行的两个第三方包管理工具：godep和dep。godep从go 1.0开始就可以使用了，是比较老的包管理工具，早期使用go的人可能都用过godep；而dep从go 1.7开始才能使用，目前也很成熟了，也是最有可能被纳入官方的包管理工具。下面分别介绍下godep和dep的使用。

## godep
#### install
godep使用起来非常方便，安装：
```
go get github.com/tools/godep
```
安装完成后在项目根目录下执行：
```
godep save
```
该命令会在根目录下自动生成一个Godeps和vendor目录，它会将项目所依赖的第三方包信息写入Godeps/Godeps.json，并复制包源码到vendor目录，**注意：该命令并不会自动从远程下载依赖包，需要我们通过`go get`手动下载，godep只是将下载后包复制到vendor目录。**

#### example
这里举个例子，某项目目录结构如下：
```
├── myapp
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
│           └── decimal
│              │── decimal.go
│              │── LICENSE
│              │── README.md
└── main.go
```

然后查看Godeps.json文件内容：
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

如果我们的项目新增了某些依赖包，只需执行`godep save`就可以了，非常方便。这种包管理方式，有个不好的地方，就是需要将vendor目录提交到代码仓库，只有这样才能保证其他人使用的包版本一致。如果引用的包较多，则代码仓库将变得很庞大。

## dep
#### install
```
go get -u github.com/golang/dep/cmd/dep
```

#### dep init
上面的例子我们用dep来管理项目的包，在项目根目录下执行：`dep init`，加`-v`参数可以看到详细的下载过程，如下所示：
```
➜  dep init -v
Root project is "myapp"
 1 transitively valid internal packages
 1 external packages imported from 1 projects
(0)   ✓ select (root)
(1)	? attempt github.com/shopspring/decimal with 1 pkgs; 1 versions to try
(1)	    try github.com/shopspring/decimal@master
(1)	✓ select github.com/shopspring/decimal@master w/1 pkgs
  ✓ found solution with 1 packages from 1 projects

Solver wall times by segment:
     b-list-versions: 13.863003417s
     b-source-exists:  8.254071152s
         b-list-pkgs:  163.489659ms
              b-gmal:  126.340874ms
            new-atom:    1.770031ms
         select-atom:    1.508016ms
             satisfy:      373.44µs
         select-root:      108.46µs
  b-deduce-proj-root:      54.848µs
               other:      11.261µs

  TOTAL: 22.410731158s

  Using master as constraint for direct dep github.com/shopspring/decimal
  Locking in master (16a9418) for direct dep github.com/shopspring/decimal
```
与godep不同的是，dep可以直接从远程下载依赖包，但目前dep下载包的效率比较低，而如果是需要翻墙才能下载的包，那么dep可能会一直堵塞。

`dep init`执行完后，查看当前目录结构：
```
├── Gopkg.lock
├── Gopkg.toml
├── main.go
└── vendor/
```

分别查看其中的内容：

Gopkg.toml
```
[[constraint]]
  branch = "master"
  name = "github.com/shopspring/decimal"

```

Gopkg.lock
```
[[projects]]
  branch = "master"
  name = "github.com/shopspring/decimal"
  packages = ["."]
  revision = "16a941821474ee3986fdbeab535a68a8aa5a85d2"

[solve-meta]
  analyzer-name = "dep"
  analyzer-version = 1
  inputs-digest = "4611a9f68c8cdc0ab3ca83d01aa2e24d70c3a170fca0ec25e50b0669cdad6e4e"
  solver-name = "gps-cdcl"
  solver-version = 1
```

vendor
```
│vendor
│└── github.com
│    └── shopspring
│       └── decimal
```
可以看到，Gopkg.toml记录了所依赖的包信息，Gopkg.lock则记录了包的具体版本号和其他详细信息，而下载的包源码则放在了vendor目录下。这和PHP的包管理工具composer非常像，Gopkg.toml类似composer.json，Gopkg.lock类似composer.lock。

#### dep status
`dep status`命令用于查看当前项目依赖了哪些包，以及包的版本号：
```
➜  dep status
PROJECT                        CONSTRAINT     VERSION        REVISION  LATEST   PKGS USED
github.com/shopspring/decimal  branch master  branch master  16a9418   16a9418  1
```

这个命令很有用，当我们在项目中引用了新的第三方包后，比如在上面的例子中新增seelog包，然后执行`dep status`：
```
➜  dep status
Lock inputs-digest mismatch due to the following packages missing from the lock:

PROJECT                  MISSING PACKAGES
github.com/cihub/seelog  [github.com/cihub/seelog]

This happens when a new import is added. Run `dep ensure` to install the missing packages.
```

`dep status`会去检查Gopkg.lock和项目中引入的第三方包是否匹配，若不匹配，则会提示使用`dep ensure`安装依赖包。

执行`dep ensure`后再执行`dep status`查看状态：
```
➜  dep ensure
➜  dep status
PROJECT                        CONSTRAINT     VERSION        REVISION  LATEST   PKGS USED
github.com/cihub/seelog        *              v2.6           d2c6e5a   d2c6e5a  1
github.com/shopspring/decimal  branch master  branch master  16a9418   16a9418  1
```

查看Gopkg.lock:
```
[[projects]]
  name = "github.com/cihub/seelog"
  packages = ["."]
  revision = "d2c6e5aa9fbfdd1c624e140287063c7730654115"
  version = "v2.6"

[[projects]]
  branch = "master"
  name = "github.com/shopspring/decimal"
  packages = ["."]
  revision = "16a941821474ee3986fdbeab535a68a8aa5a85d2"

[solve-meta]
  analyzer-name = "dep"
  analyzer-version = 1
  inputs-digest = "2925ca4ed4daf92cf6986c1c9b4838e3cbc8698107c2d31d42722c3ad6de44df"
  solver-name = "gps-cdcl"
  solver-version = 1
```

查看vendor目录：
```
│vendor
│└── github.com
│    └── shopspring
│       └── decimal
│└── github.com
│    └── cihub
│       └── seelog
```

可以看到，新增的包已经被正确安装，同时，Gopkg.lock和vendor也被更新了。同理，当我们的项目不再使用某个包，也要执行`dep ensure`来更新Gopkg.lock和vendor目录。

`dep status`是根据Gopkg.lock文件的内容来列出各个依赖包信息的。

#### dep ensure
通过上面的例子我们可以知道，`dep ensure`命令会根据项目代码依赖的包，将对应包信息写入Gopkg.lock文件，将包源码下载到vendor目录，当不再使用某个包时，`dep ensure`也会将其移除。但该命令不会更新Gopkg.toml文件。

通常，我们只需要将Gopkg.toml和Gopkg.lock文件提交到代码仓库就可以了，其他人在开发同样的项目时，clone项目到本地后只需要在根目录下执行`dep ensure`就可以下载所依赖的包到vendor目录，而Gopkg.lock就是用来指定下载依赖包的版本号的。


#### 深入dep

（完）
