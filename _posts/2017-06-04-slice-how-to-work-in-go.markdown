---
layout:     post
title:      "go中slice工作原理"
keywords:   "切片,数组,slice,slice工作原理" 
description: "详细解析go中slice的工作原理"
date:       2017-06-04
published:  false 
catalog: true
tags:
    - go 
---

## 前言
slice也叫切片，是go语言中建立在数组类型之上的一种抽象类型，和数组很像，要理解slice必须先理解数组，这里简单介绍下数组。

## 数组
先看看数组的几种定义方式：
```go
// 1.声明arr是一个包含3个整型元素的数组
var arr [3]int     
// 对数组进行赋值
arr[0] = 1
arr[1] = 2
arr[2] = 3

// 2.声明arr的同时进行初始化
var arr = [3]int{1, 2, 3} //或 arr := [3]int{1, 2, 3}

// 3.同上，省略号表示数组的长度根据初始化值的个数来计算
var arr = [...]int{1, 2, 3}
```
数组是一个由固定长度的特定类型元素组成的序列，一个数组可以由零个或多个元素组成，在go语言中，数组的长度是固定的，即数组一旦被初始化，则不可再对数组中的元素进行添加或删除操作，否则会报错。

因为数组的这些特性，使得数组使用起来不是十分方便，和数组不同的是，切片的长度是可变的，这在使用过程中带来了很大的便利，在go语言中也往往使用更加灵活的切片来代替数组。

## Slice
slice两种定义方式：
```go
// 1.使用make来进行初始化
var sli = make([]int, 3)

// 2.通过数组切片赋值
var arr = [3]int{1, 2, 3}
// 取arr数组的前两个元素作为切片值
var sli = arr[:2]
```

slice的底层引用了一个数组对象，一个slice由三部分构成：指针、长度和容量。多个slice之间可以共享底层的数据，并且引用的数组部分区间可能重叠。

下面看一个例子：
```go
package main

import "fmt"

func main() {
    months := [...]string{
            1: "January",
            2: "February",
            3: "March",
            4: "April",
            5: "May",
            6: "June",
            7: "July",
            8: "August",
            9: "September",
            10: "October",
            11: "November",
            12: "December",
        }
    Q2 := months[4:7]
    summer := months[6:9]
    fmt.Println(Q2)     
    fmt.Println(summer) 
}
```
这里定义了一个包含十二月份的数组，其长度和容量都为13，第0个元素未定义会被自动初始化为空字符串。然后分别定义表示第二季度和北方夏天月份的slice，它们有重叠部分。

程序运行结果:
```go
[April May June]
[June July August]
```

这里很明显看出Q2和summer两个slice的长度为3，那么它们的容量分别是多少呢？也是3吗？
```go
package main

import "fmt"

func main() {
    months := [...]string{
            1: "January",
            2: "February",
            3: "March",
            4: "April",
            5: "May",
            6: "June",
            7: "July",
            8: "August",
            9: "September",
            10: "October",
            11: "November",
            12: "December",
        }
    Q2 := months[4:7]
    summer := months[6:9]
    fmt.Printf("len(Q2)=%v,cap(Q2)=%v\n",len(Q2),cap(Q2))
    fmt.Printf("len(summer)=%v,cap(summer)=%v\n",len(summer),cap(summer))
}
```

输出：
```go
len(Q2)=3,cap(Q2)=9
len(summer)=3,cap(summer)=7
```

切片Q2和summer的容量分别是9和7，可能有些同学会觉得很奇怪，为什么是这样的结果而不是3？我们通过下面的图来看一下Q2和summer是如何取值的:
![原理图](/img/2017/06/month.png)
前面我们提到过，slice的底层引用了一个数组对象，即Q2和summer共享同一个底层数组，所以Q2的容量是从索引4开始到数组最后一个元素，summer的容量是从索引6开始到数组最后一个元素。

我们对summer进行切片取值操作，看看不同情况下会产生什么样的结果？
```go
// 从summer切片第0个元素开始，取5个元素
endlessSummer := summer[:5]   
fmt.Println(endlessSummer)    
```

会是这样的结果吗？
```go
[June July August "" ""]
```
并不是。

运行程序，得到的正确结果如下：
```go
[June July August September October]
```
咦，summer不是只取了数组的`[June July August]`三个元素吗？是的，summer确实是只取了month数组的三个元素，但由于`cap(summer)=7`，所以对summer进行`summer[:5]`操作时会扩展summer切片，即新生成的切片`len(endlessSummer)=5`，由于共享了底层数组，所以`cap(endlessSummer)=7`

举一反三，如果是这样取切片呢：
```go
// 从summer切片第0个元素开始，取10个元素
fmt.Println(summer[:10])
```

结果会是这样吗：
```go
[June July August September October November December "" "" ""]
```

也不是。

运行程序时会发现报panic异常，咦，为什么这次没有扩展summer呢？其实是扩展了，但summer的容量只有7，所以只能将summer扩展到7个元素，如果超出cap(summer)，将导致panic异常。

通过以上程序运行结果，我们可以得到：
> 如果切片取值操作超出切片长度而没超出容量，则会扩展该切片，而如果切片取值超过切片容量，则会导致panic异常。

## 总结
