---
layout:     post
title:      "golang如何使用libgit2/git2go"
keywords:   "libgit2,git2go,如何使用libgit2/git2go,golang" 
description: "介绍golang中如何安装、使用libgit2/git2go"
date:       2018-05-14
published:  true 
catalog: true
tags:
    - go 
---

`libgit2`是基于C语言实现的操作git的api，`git2go`是golang用来调用其api的包，GitHub地址[https://github.com/libgit2/git2go](https://github.com/libgit2/git2go)，目前也实现了多个语言版本，详见[https://libgit2.github.com](https://libgit2.github.com)

## 环境需求
需要C编译的环境，请确保已安装`cmake`
`yum install cmake -y`

## 使用
go get 下载包文件，这个过程比较耗时，需要好几分钟......
```
go get github.com/libgit2/git2go
```

下载完成后可能会出现以下报错，即使`yum install libgit2`安装了`libgit2`后重新`go get`仍然会报错，查过其他文章，说是正常情况，呵呵，so，直接忽略吧
```
# pkg-config --cflags libgit2
Package libgit2 was not found in the pkg-config search path.
Perhaps you should add the directory containing `libgit2.pc'
to the PKG_CONFIG_PATH environment variable
No package 'libgit2' found
pkg-config: exit status 1
```

开始进行编译
```
cd $GOPATH/src/github.com/libgit2/git2go
git checkout next
git submodule update --init
make install
```

## 包管理
因为需要对`git2go`进行编译，所以不能像其他的第三方包`godep save`到vendor目录就完事了。建议将`go get`下来的代码执行执行`git submodule update --init`后拷贝到vendor目录下，不要执行`make install`操作，然后源码目录放一个shell脚本用来做编译操作。这样做的好处是其他同事加入该项目开发时，不需要重新`go get`和执行git操作，因为真的太耗时了，如下
```
cd $GOPATH/src/github.com/libgit2/git2go
git checkout next
git submodule update --init
rm -rf .git*
cp $GOPATH/src/github.com/libgit2/git2go $GOPATH/src/myProject/vendor/github.com/libgit2/git2go
```

编译脚本init.sh
```
#!/bin/bash
if [ -z $GOPATH ]
then
    echo -e "\$GOPATH is null\n"
    exit 1
fi

cd $GOPATH/src/myProject/vendor/github.com/libgit2/git2go
echo -e "compiling libgit2...\n"
make install

echo -e "compile completed!\n"
exit 0
```

最后上传到代码管理仓库。

## 参考
* [http://www.petethompson.net/blog/golang/2015/10/04/getting-going-with-git2go/](http://www.petethompson.net/blog/golang/2015/10/04/getting-going-with-git2go/)
* [https://github.com/odewahn/git2go-test](https://github.com/odewahn/git2go-test)

（完）
