---
layout:     post
title:      "详解go的slice及其工作原理"
keywords:   "切片,数组,slice,slice工作原理" 
description: "详细解析go中slice的工作原理"
date:       2017-06-04
published:  false 
catalog: true
tags:
    - go 
---

## 前言
slice也叫切片，是一种建立在数组类型之上的抽象类型，和数组很像，要理解slice必须先理解数组，这里简单介绍下数组。

在go语言中，数组是一个由特定类型组成的序列，它的长度是固定的，即数组的长度一旦被定义，则不可再对数组中的元素进行添加或删除操作，因此使用起来不太方便。而切片的长度是可变的，这在使用过程中带来了很大的便利，我们也往往使用更加灵活的切片来代替数组。

## Slice
slice有两种定义方式：
```go
// 1.使用内建make函数来定义
var sli = make([]int, 3)

// 2.通过取数组切片来定义
var arr = [3]int{1, 2, 3}
var sli = arr[:2]
```

一个slice由三部分构成：指针、长度和容量，slice的底层引用了一个数组对象，多个slice之间可以共享同一底层数据。

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

打印结果:
```go
[April May June]
[June July August]
```

这里很明显看出Q2和summer两个slice的长度为3，那么它们的容量分别是多少呢？也是3吗？打印一下结果就知道了。
```go
Q2 := months[4:7]
summer := months[6:9]
fmt.Printf("len(Q2)=%v,cap(Q2)=%v\n",len(Q2),cap(Q2))
fmt.Printf("len(summer)=%v,cap(summer)=%v\n",len(summer),cap(summer))
```

输出：
```go
len(Q2)=3,cap(Q2)=9
len(summer)=3,cap(summer)=7
```

有些同学可能会觉得很奇怪，为什么是这样的结果而不是3？我们通过下面的图来看一下Q2和summer是如何取数组切片的:
![原理图](/img/2017/06/month.png)
前面我们提到过，slice的底层引用了一个数组对象，而Q2和summer都是从months数组里取切片的，即他们共享同一个底层数组，所以Q2的容量是从索引4开始到数组最后一个元素，summer的容量是从索引6开始到数组最后一个元素。

OK，现在我们对summer切片进行切片取值操作，看看不同情况下会产生什么样的结果？
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
咦，summer不是只取了months数组的`[June July August]`三个元素吗？为什么summer[:5]会取出5个元素呢？是的，summer确实是只取了底层数组的三个元素，但由于`cap(summer)=7`，所以对summer进行`summer[:5]`操作时会扩展summer切片，即新生成的切片`len(endlessSummer)=5`，又由于共享了底层数组，所以`summer[:5]`会从底层数组中取出5个元素，注意新生成的切片和summer是也是共享同一底层数组的，所以`cap(endlessSummer)=7`

举一反三，如果是这样取切片呢：
```go
// 从summer切片第0个元素开始，取10个元素
fmt.Println(summer[:10])
```

结果会是下面这样吗？
```go
[June July August September October November December "" "" ""]
```

也不是。

运行程序时会发现报panic异常，咦，为什么这次没有扩展summer呢？其实是扩展了，但summer的容量只有7，所以只能将summer扩展到7个元素。在go语言中，超出cap的切片操作将导致panic异常。

通过以上程序运行结果，我们可以得到：
> 如果切片取值操作超出切片长度而没超出容量，则会扩展该切片，而如果切片取值超过切片容量，则会导致panic异常。

#### 如何引用底层数组
我们思考一下，slice是如何引用底层数组的？

答案是指针。

前面提到过，一个slice是由指针、长度和容量三部分构成。这里指针指向第一个slice元素对应的底层数组元素的地址，**要注意的是slice的第一个元素并不一定就是数组的第一个元素。**如前面的例子中，`summer := months[6:9]`，这里summer切片的指针并不是指向months[0]，而是summer的第一元素`summer[0]`，即`months[6]`，也就是`[June]`这个值。**因为slice值包含指向第一个slice元素的指针，所以对slice的修改将同时修改底层数组的元素。**

现在我们修改一下summer[0]的值，然后打印出months[6]的结果：
```go
summer[0] = "Six"
fmt.Println(months[6])
```
结果：
```go
[Six]
```
可以看到，month[6]的值同时也被修改了。

因此，向函数传递slice将允许在函数内部修改底层数组的元素，而向函数传递数组是无法在函数内部修改底层数组的元素的。

请看下面的例子：
```go
func main() {
    a := [...]int{0, 1, 2, 3, 4, 5}
    reverse(a[:])
    fmt.Println(a)
}

func reverse(s []int) {
    for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
        s[i], s[j] = s[j], s[i]
    }
}
```
运行程序，打印出a的结果：
```go
[5 4 3 2 1 0]
```
成功修改了底层数组a的元素。

#### 比较Slice
数组之间可以比较，而slice之间是不能直接比较的，即不能使用`==`操作符来比较两个slice是否相等，要想比较slice，必须将其展开对每个元素进行比较，如下：
```go
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

**slice之间之所以不能进行比较，是因为slice的元素是间接引用的。**slice引用的底层数组的元素可能会被修改，即slice在不同的时间包含不同的值，所以肯定是无法进行比较的。

#### Slice追加
slice的长度是可变的，意味着我们可以对其添加或删除元素。go提供了一个`append`函数用于向slice追加元素，那这其中到底是如何实现的呢？我们来一探究竟。

先看下面的例子：
```go
func main() {
    var x []int
    for i := 0; i < 10; i++ {
        x = append(x, i)
        fmt.Printf("%d cap=%d\t%v\n", i, cap(x), x)
    }
}
```

每一次容量的变化都会导致重新分配内存：
```go
0  cap=1    [0]
1  cap=2    [0 1]
2  cap=4    [0 1 2]
3  cap=4    [0 1 2 3]
4  cap=8    [0 1 2 3 4]
5  cap=8    [0 1 2 3 4 5]
6  cap=8    [0 1 2 3 4 5 6]
7  cap=8    [0 1 2 3 4 5 6 7]
8  cap=16   [0 1 2 3 4 5 6 7 8]
9  cap=16   [0 1 2 3 4 5 6 7 8 9]
```
让我们仔细查看i=3时的迭代。当时x包含了[0 1 2]三个元素，但是容量是4，因此可以简单将新的元素添加到末尾，不需要新的内存分配。然后新的y的长度和容量都是4，并且和x引用着相同的底层数组，如图所示:
![原理图](/img/2017/06/append1.png)

在下一次迭代时i=4，现在没有新的空余的空间了，因此appendInt函数分配一个容量为8的底层数组，将x的4个元素[0 1 2 3]复制到新空间的开头，然后添加新的元素i，新元素的值是4。新的y的长度是5，容量是8；后面有3个空闲的位置，三次迭代都不需要分配新的空间。当前迭代中，y和x是对应不同底层数组的view。这次操作如图所示：
![原理图](/img/2017/06/append2.png)

内置的append函数可能使用比appendInt更复杂的内存扩展策略。因此，通常我们并不知道append调用是否导致了内存的重新分配，因此我们也不能确认新的slice和原始的slice是否引用的是相同的底层数组空间。同样，我们不能确认在原先的slice上的操作是否会影响到新的slice。因此，通常是将append返回的结果直接赋值给输入的slice变量：
`slice := append(slice, s)`

更新slice变量不仅对调用append函数是必要的，实际上对应任何可能导致长度、容量或底层数组变化的操作都是必要的。要正确地使用slice，需要记住尽管底层数组的元素是间接访问的，但是slice对应结构体本身的指针、长度和容量部分是直接访问的。要更新这些信息需要像上面例子那样一个显式的赋值操作。从这个角度看，slice并不是一个纯粹的引用类型，它实际上是一个类似下面结构体的聚合类型：
```go
type IntSlice struct {
    ptr      *int
    len, cap int
}
```

官方没有提供append函数的源码，这里我们基于以上原理自己实现了一个类似append的函数：
```go
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

为了提高内存使用效率，新分配的slice一般略大于保存x和y所需要的最低大小。通过在每次扩展数组时直接将长度翻倍从而避免了多次内存分配，也确保了添加单个元素的平均时间是一个常数时间。


#### 删除Slice元素
go没有提供直接删除slice元素的函数，要删除slice中的元素，实现方法比较有意思。

要删除slice中间的某个元素并保存原有的元素顺序，可以通过内置的copy函数将后面的子slice向前依次移动一位完成：

```go
func remove(slice []int, i int) []int {
    copy(slice[i:], slice[i+1:])
    return slice[:len(slice)-1]
}

func main() {
    s := []int{5, 6, 7, 8, 9}
    fmt.Println(remove(s, 2)) // "[5 6 8 9]"
}
```
如果删除元素后不用保持原来顺序的话，我们可以简单的用最后一个元素覆盖被删除的元素：

```go
func remove(slice []int, i int) []int {
    slice[i] = slice[len(slice)-1]
    return slice[:len(slice)-1]
}

func main() {
    s := []int{5, 6, 7, 8, 9}
    fmt.Println(remove(s, 2)) // "[5 6 9 8]
}
```

#### Slice内存技巧
比如我们要去除一个slice中的空字符串：
```go
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
```go
func nonempty2(strings []string) []string {
    out := strings[:0] // zero-length slice of original
    for _, s := range strings {
        if s != "" {
            out = append(out, s)
        }
    }
    return out
}
```

## 总结
