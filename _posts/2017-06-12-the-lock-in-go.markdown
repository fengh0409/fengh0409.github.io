---
layout:     post
title:      "Go的锁机制"
keywords:   "sync,Mutex,RWMutex,WaitGroup,锁,lock,go" 
description: "详细描述go语言的锁机制"
date:       2017-06-12
published:  true 
catalog: true
tags:
    - go 
---

go是一门并发特性非常强大的语言，我们在实现并发编程时，往往会碰到多个线程同时访问同一个变量的情况，也就是所谓的竞态，这种情况可能会导致数据混乱出错，因此，这个时候就需要对变量上锁，来保证一次只有一个线程能修改该变量，下面将详细介绍go的锁机制。

## sync
go语言中的锁机制是通过自带的sync包来实现的，该包包含了以下几种锁类型。

## sync.Mutex
Mutex是互斥锁，其定义方式很简单，先是定义了一个Mutex类型结构体，然后该类型实现了Lock()和Unlock()两个方法。
```
type Mutex struct {
    state int32
    sema  uint32
}

func (m *Mutex) Lock()

func (m *Mutex) Unlock()
```

当一个变量被上了互斥锁后，其他访问该变量的线程会被堵塞，不可对该变量进行读写操作，直到锁被释放。下面是一个互斥锁的例子：
```
package main

import (
    "fmt"
    "sync"
    "time"
)

var m *sync.Mutex

func main() {
    m = new(sync.Mutex)
    go read(1)
    go read(2)
    time.Sleep(time.Second) // 让goroutine有足够的时间执行完
}

func read(i int) {
    fmt.Println(i, "begin lock")
    m.Lock()
    fmt.Println(i, "in lock")
    m.Unlock()
    fmt.Println(i, "unlock")
}
```

main函数里启了两个goroutine，调了两次read函数，无论哪个goroutine先执行，先调用read函数的会先获得互斥锁，而另一个goroutine在获取互斥锁时发现已经被占用了，其必须等待互斥锁被释放后才能获得该线程内的互斥锁，所以程序打印结果只会是以下两种:

```
1 begin lock
2 begin lock
1 in lock
1 unlock
2 in lock
2 unlock

// 或
2 begin lock
1 begin lock
2 in lock
2 unlock
1 in lock
1 unlock
```

而不会出现在`1 lock start`中打印出`2 in lock`的情况。

## sync.RWMutex
在上面的例子中，如果有很多goroutine并发执行的话就会存在一个问题，因为某个线程获得互斥锁后，其他的goroutine被堵塞，导致程序的效率较低，这种情况下就需要用到读写锁RWMutex了。

RWMutex是基于互斥锁Mutex实现的，包含了读锁Rlock()和写锁Lock()，上读锁时，数据可以被多个goroutine并发访问但不可写，而上写锁时，数据不可被其他goroutine读或写。下面是其定义方式：
```
type RWMutex struct {
    w           Mutex  // held if there are pending writers
    writerSem   uint32 // semaphore for writers to wait for completing readers
    readerSem   uint32 // semaphore for readers to wait for completing writers
    readerCount int32  // number of pending readers
    readerWait  int32  // number of departing readers
}

func (*RWMutex) Lock    // 写锁

func (*RWMutex) Unlock

func (*RWMutex) RLock   // 读锁

func (*RWMutex) RUnlock
```

我们将上面互斥锁的例子改写一下：
```
package main

import (
	"fmt"
	"sync"
	"time"
)

var m *sync.RWMutex
var val = 0

func main() {
	m = new(sync.RWMutex)
	go read(1)
	go write(2)
	go read(3)
	time.Sleep(5 * time.Second)
}

func read(i int) {
	fmt.Println(i, "begin read")
	m.RLock()
	time.Sleep(1 * time.Second)
	fmt.Println(i, "val: ", val)
	time.Sleep(1 * time.Second)
	m.RUnlock()
	fmt.Println(i, "end read")
}

func write(i int) {
	fmt.Println(i, "begin write")
	m.Lock()
	val = 10
	fmt.Println(i, "val: ", val)
	time.Sleep(1 * time.Second)
	m.Unlock()
	fmt.Println(i, "end write")
}
```

可能的打印结果：
```
2 begin write
3 begin read
1 begin read
2 val:  10
2 end write
1 val:  10
3 val:  10
1 end read
3 end read
```

分析以上结果可以看到，2在写的时候，无法打印出1或3的val，只有2 end write了，才能开始打印出他们的val，说明写锁期间其他goroutine不能访问该变量。继续分析发现在1还没有end read时，已经打印出了3的val，说明读锁期间是允许多个goroutine访问同一变量的。

> RWMutex只有当获得锁的大部分goroutine都是读操作，而锁在竞争条件下，也就是说，goroutine们必须等待才能获取到锁的时候，使用RWMutex才是最能带来好处的。RWMutex需要更复杂的内部记录，所以它会比一般的无竞争锁的mutex慢一些。

## sync.Once
某些情况下，多个goroutine并发执行时，我们希望goroutine中的某个函数只执行一次，这时候用Once就非常方便了。其定义方式如下：
```
type Once struct {
    m    Mutex
    done uint32
}

func (o *Once) Do(f func())
```
该类型也是基于Mutex实现的，因为只会调用一次，其作用类似于init初始化函数，也往往用于初始化操作，请看下面的例子：
```
package main

import (
    "fmt"
    "sync"
    "time"
)

func main() {
    var once sync.Once
    for i := 0; i < 10; i++ {
        go func() {
            once.Do(read)
        }()
    }
    time.Sleep(time.Second)
}

func read() {
    fmt.Println(1)
}
```
打印结果：
```
1
```
最终只会打印出一次1。

## sync.WaitGroup
WaitGroup用于等待一组goroutine执行完成，主线程调用Add方法来设置要等待的goroutine数量，每个goroutine运行后会调用Done方法，同时Wait方法会一直堵塞直到所有goroutine执行完成。
```
type WaitGroup struct {
    // contains filtered or unexported fields
}

func (wg *WaitGroup) Add(delta int)

func (wg *WaitGroup) Done()

func (wg *WaitGroup) Wait()
```

我们结合下面的例子来看看它是如何实现的：
```
package main

import (
    "fmt"
    "sync"
    "time"
)

func main() {
    var wg sync.WaitGroup
    var str = []string{
        "Hello, World",
        "Hello, Go",
        "Bye, PHP",
    }
    for _, s := range str {
        // Increment the WaitGroup counter.
        wg.Add(1)
        // Launch a goroutine to read the str.
        go func(s string) {
            // Decrement the counter when the goroutine completes.
            defer wg.Done()
            // Println the s.
            read(s)
        }(s)
    }
    // Wait for all goroutine to complete.
    wg.Wait()
}

func read(s string) {
    time.Sleep(time.Second * 1)
    fmt.Println(s)
}
```

WaitGroup中存在一个计数器，其原理其实是通过这个计数器来实现的。Add接受一个int类型的参数，当传入正整数n时，计数器的值会增加n，当传入负整数n时，计数器的值会减少n；而当计数器的值等于0时，也就意味着所有goroutine执行完了，堵塞的Wait会被释放，WaitGroup的使命也就完成了。**注意：Wait释放之前，计数器的值不能为负，否则程序会panic掉。**

上述例子中，main函数执行时，Wait会一直堵塞，for循环开始都会调用一次Add(1)，使计数器加一，每个goroutine执行完成后会调用Done，使计数器减一，这个Done其实是调用了Add(-1)，大家可以查看下源码。这样，整个for循环跑完后计数器的值肯定是0，也就是说所有goroutine执行完了，然后堵塞的Wait会被释放，后面的程序会继续执行。

根据以上结论，我们也可以将wg.Add()写在for循环外面：
```
func main() {
    var wg sync.WaitGroup
    var str = []string{
        "Hello, World",
        "Hello, Go",
        "Bye, PHP",
    }
    // Increment the WaitGroup counter.
    wg.Add(len(str))
    for _, s := range str {
        // Launch a goroutine to read the str.
        go func(s string) {
            // Decrement the counter when the goroutine completes.
            defer wg.Done()
            // Println the s.
            read(s)
        }(s)
    }
    wg.Wait()
}
```

打印结果：
```
Hello, World
Hello, Go
Bye, PHP
```

## sync.Cond
Cond的作用和WaitGroup是一样的，都是让goroutine堵塞，不同的是WaitGroup是被动堵塞，所有goroutine跑完后，wait会自动释放，而Cond是主动堵塞，我们必须给cond发送一个信号，来通知wait释放。
```
type Cond struct {
    noCopy noCopy

    // L is held while observing or changing the condition
    L Locker

    notify  notifyList
    checker copyChecker
}

func NewCond(l Locker) *Cond

func (c *Cond) Signal()

func (c *Cond) Broadcast()

func (c *Cond) Wait()
```

通过Cond的定义方式可以看到，通过调用NewCond函数来获得一个Cond对象，每个Cond都关联一个Locker L（通常是一个\*Mutex或\*RWMutex），在更改条件和调用Wait方法时必须持有该Locker。
```
package main

import (
    "fmt"
    "sync"
    "time"
)

func main() {
    locker := new(sync.Mutex)
    cond := sync.NewCond(locker)
    done := false

    cond.L.Lock()

    go func() {
        time.Sleep(time.Second * 1)
        done = true
        cond.Signal()    // 发送信号，通知Wait()释放
    }()

    if !done {
        cond.Wait()      // 堵塞主goroutine
    }

    fmt.Println("now done is", done)    //一秒钟后会打印出 now done is true
}
```
这里的cond.Signal()就是用来发送一个信号给Wait来通知其释放的，sync.Cond还有一个BroadCast方法，用来通知释放所有堵塞的gouroutine。
```
package main

import (
    "fmt"
    "sync"
    "time"
)

var locker = new(sync.Mutex)
var cond = sync.NewCond(locker)

func read(x int) {
    cond.L.Lock()    // 获取锁
    cond.Wait()      // 等待通知，暂时阻塞
    fmt.Println(x)
    time.Sleep(time.Second * 1)
    cond.L.Unlock()  // 释放锁，不释放的话将只会有一次输出
}

func main() {
    for i := 0; i < 40; i++ {
        go read(i)
    }
    fmt.Println("start all")
    time.Sleep(time.Second * 1)
    cond.Broadcast() // 下发广播给所有等待的goroutine
    time.Sleep(time.Second * 60)
}
```

（完）
