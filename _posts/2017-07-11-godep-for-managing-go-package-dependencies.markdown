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
目前go并没有官方的包管理工具，比较流行的是godep。godep从go 1.0开始就可以使用了，是比较老的包管理工具，早期使用go的人应该都用过godep。而dep是2017年初才发布的包管理工具，要求go >= 1.7，目前还不太成熟了，用的人很少，不过却是最有可能被纳入官方的包管理工具。下面分别介绍下godep和dep的使用。

## godep
#### install
godep使用起来非常简单，安装：
```
go get github.com/tools/godep
```
安装完成后在项目根目录下执行：
```
godep save
```
该命令会在根目录下自动生成一个Godeps和vendor目录，并将项目所依赖的第三方包信息写入Godeps/Godeps.json，同时复制包源码到vendor目录。**注意：`godep save`并不会自动从远程下载依赖包，需要我们通过`go get`或`godep get`手动下载，`godep save`只是将下载的包源码复制到vendor目录。**

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

如果我们的项目新增了某些依赖包，只需执行`godep save`就可以了，非常方便。但这种包管理方式，也有个不好的地方，就是除了Godep.json文件，还需要将vendor目录也提交到代码仓库，而且只要变更了引入的第三方包，则要重新提交vendor目录，只有这样才能保证其他人使用的包版本一致。如果引用的包较多，则代码仓库将变得很庞大。

## dep
#### install
再来看看dep，安装也很简单：
```
go get -u github.com/golang/dep/cmd/dep
```

#### dep init
上面的例子我们用dep来管理项目的包，将godep生成的内容删除，在项目根目录下执行：`dep init`，加`-v`参数可以看到详细的下载过程，如下所示：
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
与godep不同的是，dep可以直接从远程下载依赖包，但目前下载的速度较慢，而如果是需要翻墙才能下载的包，那么dep可能会一直堵塞。

`dep init`执行完后，查看当前目录结构，dep生成了两个文件和一个vendor目录：
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
可以看到，Gopkg.toml记录了项目所依赖的第三方包信息，Gopkg.lock则记录了包的具体版本号和其他详细信息，而下载的包源码则放在了vendor目录下。Phper会发现，dep的设计和PHP的包管理工具composer非常像，都有一个vendor目录用于存放包源码，Gopkg.toml类似composer.json，Gopkg.lock类似composer.lock。

dep是如何下载依赖包的呢？**dep在下载依赖包时，会先去检查$GOPATH下是否已经存在该包，若存在，则dep直接将其拷贝到vendor目录下；若不存在，则会从远程下载。**

#### dep status
`dep status`命令用于查看当前项目依赖了哪些包，以及包的版本号：
```
➜  dep status
PROJECT                        CONSTRAINT     VERSION        REVISION  LATEST   PKGS USED
github.com/shopspring/decimal  branch master  branch master  16a9418   16a9418  1
```

这个命令很有用，当我们在项目中引用了新的第三方包后，比如在上面的例子中新增seelog包：
```go
package main

import (
    "fmt"

    log "github.com/cihub/seelog"
    "github.com/shopspring/decimal"
)

func main() {
    defer log.Flush()
    price, err := decimal.NewFromString("136.204")
    if err != nil {
        log.Error(err)
    }

    fmt.Println(price.StringFixed(2))
}

```

如果我们没有执行`dep ensure`，而是先执行`dep status`：
```
➜  dep status
Lock inputs-digest mismatch due to the following packages missing from the lock:

PROJECT                  MISSING PACKAGES
github.com/cihub/seelog  [github.com/cihub/seelog]

This happens when a new import is added. Run `dep ensure` to install the missing packages.
```

发现dep给出了一个提示信息，告知我们seelog包未导入，这是因为`dep status`会去检查Gopkg.lock和vendor目录，并和项目中引入的第三方包进行比较是否匹配，若不匹配，则会提示使用`dep ensure`安装依赖包。

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

可以看到，新增的seelog包已经被正确安装，同时，Gopkg.lock和vendor也被更新了。

这里有一点要说明以下，就是`dep status`的结果是根据Gopkg.lock和Gopkg.toml文件得到的，`CONSTRAINT`字段是由Gopkg.toml约束，如果toml文件不存在该包的约束，则用`*`代替；`VERSION`字段的值和lock文件一致。现在我们修改一下Gopkg.lock，删除其中一条包信息：
```
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

执行`dep status`：
```
➜  dep status
PROJECT                        CONSTRAINT     VERSION        REVISION  LATEST   PKGS USED
github.com/shopspring/decimal  branch master  branch master  16a9418   16a9418  1
```

结果只会列出decimal包信息，而如果删除Gopkg.lock文件，`dep status`的结果将为空。注意：我们一般不会去修改Gopkg.lock文件，因为修改该文件并没有什么意义，这里我只是想说明一下`dep status`的工作原理。

#### dep ensure
`dep ensure`命令会根据项目代码依赖的包，将对应包信息写入Gopkg.lock文件，将包源码下载到vendor目录，当不再使用某个包时，执行该命令也会将其从vendor中移除，并更新Gopkg.lock文件。**但是，`dep ensure`不会去更新Gopkg.toml。**

那么，`dep ensure`是如何知道要下载的包的版本号呢？下面要划重点了：**`dep ensure`下载依赖包的版本是根据Gopkg.toml来的，而Gopkg.lock只是用来记录下载的各个依赖包的具体版本信息。**

我们这里将dep自动生成的文件和目录都删除，重新执行一下`dep init`，然后查看Gopkg.toml:
```
[[constraint]]
  name = "github.com/cihub/seelog"
  version = "2.6.0"

[[constraint]]
  branch = "master"
  name = "github.com/shopspring/decimal"

```
为什么这里的版本约束一个是version而另一个是branch呢？这是因为远程的decimal包没有tag，只有master分支，所以decimal的版本约束是master；而seelog是有tag的，所以它的版本约束则是该包的最大tag，也就是最大版本号。**注意：这里version对应的版本号并不是具体的版本号，而是告诉dep下载依赖包时要取大于该版本的最大版本号所对应的版本，如果没有比这个大的版本号，则该版本就是最大的。**

我们看个例子，我将Gopkg.toml中seelog的version改成这样子：
```
version = "2.4.0"
```

然后执行`dep ensure -update`来更新lock文件和vendor目录，执行完后查看Gopkg.lock的seelog部分：
```
[[projects]]
  name = "github.com/cihub/seelog"
  packages = ["."]
  revision = "d2c6e5aa9fbfdd1c624e140287063c7730654115"
  version = "v2.6"

```

可以看到version并没有变成`v2.4`，我们上面说过，dep会去取大于它的最大版本，所以还是`v2.6`。当然，要改变其版本号也是可以的，在Gopkg.toml的version约束中加个`=`就可以了，如下所示：
```
version = "=2.4.0"
```
执行`dep ensure -update`，查看lock，版本号已变更：
```
[[projects]]
  name = "github.com/cihub/seelog"
  packages = ["."]
  revision = "607e384a1381d32741a74b66dacedcb0642d3d82"
  version = "v2.4"

```

>这里我非常不理解这样的设计，lock文件各个包的版本号都是指定了的，为什么不根据lock文件去下载依赖包呢？而自动生成的toml文件中的包版本约束也默认不是具体的版本号，dep在下载包时会去取大于该版本的最大版本号，这样的话就有问题了，如果我们将该Gopkg.toml和Gopkg.lock文件提交到代码仓库后，而这个包的作者又提交了一个新的版本，那么其他开发人员下载的依赖包版本和我们包版本就不一致了。

## 总结
dep的设计方向是很好的，和PHP的composer大致一样，但却远不如composer做的好，也可能还不够成熟的缘故，需要改进的地方还很多。就目前来说，不建议大家使用dep，项目的包管理工具还是使用Godep比较好，虽然要提交vendor目录到代码仓库，但至少能保证不同开发人员使用的依赖包版本是一致的。

（完）
