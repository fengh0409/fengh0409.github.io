---
layout:     post
title:      "详解Go的slice及其工作原理"
keywords:   "切片,数组,slice,slice工作原理" 
description: "详细解析go中slice的工作原理"
date:       2017-06-04
published:  true 
catalog: true
tags:
    - go 
---

## 前言
slice也叫切片，是一种建立在数组类型之上的抽象类型，和数组很像，要理解slice必须先理解数组，这里简单介绍下数组。

在go语言中，数组是一个由特定类型组成的序列，它的长度是固定的，即数组的长度一旦被定义，则不可再对数组中的元素进行添加或删除操作，因此使用起来不太方便。而切片的长度是可变的，这在使用过程中带来了很大的便利，我们也往往使用更加灵活的切片来代替数组。

## Slice
下面有段程序，我们分别定义一个数组a和切片b，对其每个元素乘以2，然后查看打印结果。
```
package main

import (
    "fmt"
)

func main() {
    a := [5]int{1, 2, 3, 4, 5}
    b := []int{1, 2, 3, 4, 5}
    mulA(a)
    fmt.Println(a) 

    mulB(b)
    fmt.Println(b)
}

func mulA(a [5]int) {
    for i, _ := range a {
        a[i] *= 2
    }
}

func mulB(a []int) {
    for i, _ := range a {
        a[i] *= 2
    }
}

```

打印结果：
```
[1 2 3 4 5]
[2 4 6 8 10]
```

通过打印的结果，我们可以看到，数组a的元素还是原来的值，而切片b的元素被修改了。在go语言中，数组的传递是值传递，所以其值未变，这个大家都知道。那为什么切片的值就被成功修改了呢？我们先弄清楚切片的概念。

> **一个slice由三部分构成：指针、长度和容量，slice的底层引用了一个数组对象，多个slice之间可以共享同一底层数据，指针指向第一个slice元素对应的底层数组元素的地址，要注意的是slice的第一个元素并不一定就是数组的第一个元素。**

这个弄明白，slice基本就懂了。因为slice是对一个底层数组的引用，所以向函数传递slice将允许在函数内部修改slice的值，因此上述切片b的元素被成功修改。当然，我们要使用上述方法修改数组a的值也是可以的，将数组以指针的形式传递给函数，如下：
```
func main() {
    a := [5]int{1, 2, 3, 4, 5}
    mulA(&a)
    fmt.Println(a) 

}

func mulA(a *[5]int) {
    for i, _ := range a {
        a[i] *= 2
    }
}

```
虽然这样可以实现同样的效果，但一般不建议这么做，因为实现起来更加繁琐，而使用slice则更加便利。

下面再看一个例子：
```
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

打印结果:
```
[April May June]
[June July August]
```

这里可以看出Q2和summer两个slice的长度为3，那它们的容量又分别是多少呢？也是3吗？
```
Q2 := months[4:7]
summer := months[6:9]
fmt.Printf("len(Q2)=%v,cap(Q2)=%v\n",len(Q2),cap(Q2))
fmt.Printf("len(summer)=%v,cap(summer)=%v\n",len(summer),cap(summer))
```

输出：
```
len(Q2)=3,cap(Q2)=9
len(summer)=3,cap(summer)=7
```

有些同学可能会觉得很奇怪，为什么是这样的结果？我们通过下面的图来看一下Q2和summer是如何取数组切片的:
![原理图](/img/2017/06/month.png)
前面我们提到过，slice的底层引用了一个数组对象，而Q2和summer都是从months数组里取的切片，即他们共享同一个底层数组，所以Q2的容量是从Q2的第一个元素Q2[0]即months[4]开始到数组最后一个元素，summer的容量是从summer的第一个元素summer[0]即months[6]开始到数组最后一个元素。

OK，现在我们对summer切片再进行切片操作，看看取不同长度会产生什么样的结果。
```
// 从summer切片第0个元素开始，取5个元素
endlessSummer := summer[:5]   
fmt.Println(endlessSummer)    
```

会是这样的结果吗？
```
[June July August "" ""]
```
并不是。

运行程序，得到的正确结果如下：
```
[June July August September October]
```
咦，summer不是只取了months数组的`[June July August]`三个元素吗？为什么summer[:5]会取出5个元素呢？是的，summer确实是只取了底层数组的三个元素，但由于`cap(summer)=7`，所以对summer进行`summer[:5]`操作时会扩展summer切片，即新生成的切片`len(endlessSummer)=5`，又由于共享了底层数组，所以`summer[:5]`会从底层数组中取出5个元素，注意新生成的切片和summer是也是共享同一底层数组的，所以`cap(endlessSummer)=7`

举一反三，如果是这样取切片呢：
```
// 从summer切片第0个元素开始，取10个元素
fmt.Println(summer[:10])
```

结果会是下面这样吗？
```
[June July August September October November December "" "" ""]
```

也不是。

运行程序时会发现报panic异常，咦，为什么这次没有扩展summer呢？其实是扩展了，但summer的容量只有7，所以只能将summer扩展到7个元素。**在go语言中，超出cap的切片操作将导致panic异常。**

当获取一个切片时，若省略结束值，则其默认是切片的长度而不是容量；若指定结束元素，则可指定为容量：
```
fmt.Println(summer[:])    // [June July August]
fmt.Println(summer[:7])   // [June July August September October November December]
fmt.Println(summer[:8])   // panic
```

#### Slice比较
请看下面的例子，b和c切片取自同一个底层数组，然后比较他们是否相等
```
func main() {
    a := [...]int{1, 2, 3, 4, 5}
    b := a[:]
    c := a[:]
    fmt.Println(b==c) //invalid operation: b == c (slice can only be compared to nil)
}
```

运行程序会发现直接报错，这是因为在go语言中不能直接比较两个slice是否相等，这是一个不合法的操作（数组是可以直接比较的），要想比较两个slice，我们只能通过间接比较slice中的每个元素来确定slice是否相等。
```
func equal(x, y []string) bool {
    if len(x) != len(y) {
        return false
    }
    for i := range x {
        if x[i] != y[i] {
            return false
        }
    }
    return true
}
```

> **slice之间之所以不能进行比较，是因为slice的元素是间接引用的。slice引用的底层数组的元素随时可能会被修改，即slice在不同的时间可能包含不同的值，所以无法进行比较。**

#### Slice追加
slice的长度是可变的，意味着我们可以对其添加或删除元素。go提供了一个内置的`append`函数用于向slice追加元素，当超出切片容量时也可以继续追加，那这其中到底是如何实现的呢？我们来一探究竟。

先看下面的例子：
```
func main() {
    var x []int
    for i := 0; i < 10; i++ {
        x = append(x, i)
        fmt.Printf("%d len=%d,cap=%d\t%v\n", i, len(x), cap(x), x)
    }
}
```

打印结果：
```
0 len=1,cap=1	[0]
1 len=2,cap=2	[0 1]
2 len=3,cap=4	[0 1 2]
3 len=4,cap=4	[0 1 2 3]
4 len=5,cap=8	[0 1 2 3 4]
5 len=6,cap=8	[0 1 2 3 4 5]
6 len=7,cap=8	[0 1 2 3 4 5 6]
7 len=8,cap=8	[0 1 2 3 4 5 6 7]
8 len=9,cap=16	[0 1 2 3 4 5 6 7 8]
9 len=10,cap=16	[0 1 2 3 4 5 6 7 8 9]
```
让我们仔细查看i=3时的迭代。当时x包含了[0 1 2]三个元素，但是容量是4，因此可以简单将新的元素添加到末尾，不需要新的内存分配，此时x的长度和容量都是4。

当i=4，现在x没有多余的空间来存放新的元素了，但此时x的长度变成5，容量变成8。由此可知，当向切片追加元素时，若没有多余空间存放新的元素，go会自动扩展切片，将切片容量直接增加一倍。当i=8时，切片容量也由8变为16，扩大了一倍。

这里有个问题是无法确认append函数在增加切片容量时是否分配了新的内存，所以往往将追加元素后的切片值赋给原来切片变量：`slice := append(slice, s)`

更新slice变量不仅对调用append函数是必要的，实际上对应任何可能导致长度、容量或底层数组变化的操作都是必要的。要正确地使用slice，需要记住尽管底层数组的元素是间接访问的，但是slice对应结构体本身的指针、长度和容量部分是直接访问的。从这个角度看，slice并不是一个纯粹的引用类型，它实际上是一个类似下面结构体的聚合类型(摘自go语言圣经)：
```
type IntSlice struct {
    ptr      *int
    len, cap int
}
```

官方没有提供append函数的源码，这里我们基于以上原理自己实现了一个类似append的函数：
```
func appendInt(x []int, y int) []int {
    var z []int
    zlen := len(x) + 1
    if zlen <= cap(x) {
        z = x[:zlen]
    } else {
        zcap := zlen
        if zcap < 2*len(x) {
            zcap = 2 * len(x)
        }
        z = make([]int, zlen, zcap)
        copy(z, x) 
    }
    z[len(x)] = y
    return z
}
```
每次调用appendInt函数时，会先检测slice底层数组是否有足够的容量来保存新添加的元素。如果有足够空间，则直接在原有的底层数组基础上扩展slice，将新添加的y元素复制到新扩展的空间，并返回slice。因此，输入的x和输出的z共享相同的底层数组。

如果没有足够的增长空间，即追加元素后slice的长度大于容量，此时appendInt函数会创建一个新的slice，其长度为原有slice追加元素后的长度，容量为长度的两倍，然后将原有的slice复制到新的slice，最后添加y元素。因此，结果z和输入的x引用的将是不同的底层数组。

#### Slice删除元素
go没有提供直接删除slice元素的函数，要删除slice中的元素，实现方法比较有意思。

要删除slice中间的某个元素并保存原有的元素顺序，可以通过内置的copy函数将后面的子slice向前依次移动一位，然后删除切片到倒数第二个元素：

```
func remove(x []int, i int) []int {
    copy(x[i:], x[i+1:])
    return x[:len(x)-1]
}

func main() {
    s := []int{1, 2, 3, 4, 5}
    fmt.Println(remove(s, 2))
}
```

打印结果：
```
[1 2 4 5]
```

如果删除元素后不用保持原来顺序的话，我们可以直接用最后一个元素覆盖被删除的元素：

```
func remove(x []int, i int) []int {
    x[i] = x[len(x)-1]
    return x[:len(x)-1]
}

func main() {
    s := []int{1, 2, 3, 4, 5}
    fmt.Println(remove(s, 2))
}
```

打印结果：
```
[1 2 5 4]
```

#### Slice内存技巧
比如我们要去除一个slice中的空字符串：
```
package main

import "fmt"

func nonempty(strings []string) []string {
    i := 0
    for _, s := range strings {
        if s != "" {
            strings[i] = s
            i++
        }
    }
    return strings[:i]
}
```
这里直接在原有的slice上进行修改，输入和输出的slice共享同一个底层数组，避免了重新分配内存。因此我们通常会这样使用nonempty函数：data = nonempty(data)。

nonempty函数也可以使用append函数实现：
```
func nonempty2(strings []string) []string {
    out := strings[:0] 
    for _, s := range strings {
        if s != "" {
            out = append(out, s)
        }
    }
    return out
}
```

## 总结
在实际开发过程中，使用切片往往比数组会更有优势，在某些情况下也能够节省内存空间，但同时要注意修改切片会同时修改掉所引用的底层数组的数据。

（完）
