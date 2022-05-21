---
layout:     post
title:      "Go的变量命名"
keywords:   "go变量,命名" 
description: "如何命名一个变量，使其更易读"
date:       2017-06-27
published:  true 
catalog: true
tags:
    - go 
---

#### 名字的重要性
**可读性是定义良好代码的标准，好的名字对于可读性至关重要**，这是对于Go的变量命名来讲的。

#### 好的变量名
一个好的变量名的标准：
* 一致（容易猜测）
* 简短（容易声明）
* 准确（容易理解）

#### 经验法则
变量声明的地方与使用它的地方隔的越远，则变量名应该越长。

#### 使用大小写混合
Go中的变量名应该使用大小写混合，而不应使用names_with_underscores这种下划线分隔的，首字母缩写词应该都是大写字母，如ServeHTTP和IDProcessor.

#### 局部变量
保持简短的局部变量名，长的变量名会掩盖代码的真正作用。

如，使用变量名`i`优于`index`，使用变量名`r`优于`reader`。

较长的变量名在很长的函数或带有很多局部变量的函数中可能很有用，但这往往意味着你的代码该重构了。

不要这样命名：
```
func RuneCount(buffer []byte) int {
    index, count := 0, 0
    for index < len(buffer) {
        if buffer[index] < RuneSelf {
            index++
        } else {
            _, size := DecodeRune(buffer[index:])
            index += size
        }
        count++
    }
    return count
}
```

而应该这样命名：
```
func RuneCount(b []byte) int {
    i, n := 0, 0
    for i < len(b) {
        if b[i] < RuneSelf {
            i++
        } else {
            _, size := DecodeRune(b[i:])
            i += size
        }
        n++
    }
    return n
}
```

#### 参数
函数参数类似局部变量，但它们也可以用于文档说明。

如果参数类型是描述性的，那么它们应该是简短的：
```
func AfterFunc(d Duration, f func()) *Timer

func Escape(w io.Writer, s []byte)
```

如果参数类型有歧义，那么变量名应该可以提供说明：
```
func Unix(sec, nsec int64) Time

func HasPrefix(s, prefix []byte) bool
```

#### 返回值
导出函数的返回值命名应该仅仅被用于文档说明。

下面是命名返回值的比较好的例子：
```
func Copy(dst Writer, src Reader) (written int64, err error)

func ScanBytes(data []byte, atEOF bool) (advance int, token []byte, err error)
```

#### 接收器
接收器是一种特殊的参数。

按照惯例，它们是反映接收器类型的一个或两个字符，因为它们通常出现在几乎每一行：
```
func (b *Buffer) Read(p []byte) (n int, err error)

func (sh serverHandler) ServeHTTP(rw ResponseWriter, req *Request)

func (r Rectangle) Size() Point
```

接收器的命名在一个类型的方法中应该是一致的（不要在一个方法中使用r，而在另一个方法中使用rdr）。

#### 导出的包级别名称
在命名导出的变量，常量，函数和类型时记住：**导出的名称由其包名称限定**。

这就是为什么我们有`bytes.Buffer`和`strings.Reader`，而不是`bytes.ByteBuffer`和`strings.StringReader`。

#### 接口类型
仅指定了一个方法的接口，该接口的命名在函数名后加`er`即可。
```
type Reader interface {
    Read(p []byte) (n int, err error)
}
```

有时候加了`er`的接口名不是一个正确的英文单词，但我们仍然会使用该命名：
```
type Execer interface {
    Exec(query string, args []Value) (Result, error)
}
```

有时候我们根据英语语法来命名，使其看起来更容易理解：
```
type ByteReader interface {
    ReadByte() (c byte, err error)
}
```

当一个接口包含多个方法时，请选择一个可以准确描述其作用的名称。（例如: net.Conn, http.ResponseWriter, io.ReadWriter）

#### 错误
错误类型接口的命名应该是`FooError`这种形式：
```
type ExitError struct {
    ...
}
```

错误的变量命名应该是`ErrFoo`这种形式：
```
var ErrFormat = errors.New("image: unknown format")
```

#### 包名
选择对其导出的名称有意义的包名称，避免使用util,common等这种通用的名称。

#### 导入路径
一个包路径的最后一部分应该和包名一致：
```
"compress/gzip" // package gzip
```

避免在库和包路径的stutter：
```
"code.google.com/p/goauth2/oauth2" // bad; my fault
```

对于库来说，经常将包代码放在仓库根目录：
```
"github.com/golang/oauth2" // package oauth2
```

也避免大写字母，因为并不是所有的文件系统都区分大小写。

#### 标准库
这篇文章的许多例子来源于标准库。标准库是一个很好的可以找到良好代码的地方，多看看标准库来寻找变量命名的灵感。

#### 总结
* 使用短变量
* 考虑上下文
* 根据自己的判断来命名
