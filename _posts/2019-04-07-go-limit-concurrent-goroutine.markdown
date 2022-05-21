---
layout:     post
title:      "Go的并发控制"
keywords:   "go,并发,并发控制,concurrent" 
description: "golang并发控制，控制goroutine数量"
date:       2019-04-07
published:  true 
catalog: true
tags:
    - go
---
## 并发
下面很简单的一个并发例子：

定义一个全局变量名为 requests 的 `channel`  ，每当有一个请求过来，都会往这个 `channel` 里写入当前时间，同时 handleRequest 函数会一直遍历该 `channel`，每当有一个请求过来，会启一个 goroutine 的 myhandle 函数去处理相应业务逻辑。
```
package main

import (  
	"fmt"  
	"log" 
	"net/http" 
	"time"
)  
  
var requests = make(chan string)  
  
func main() {  
   go handleRequests()  
   http.HandleFunc("/test", test)  
   log.Fatal(http.ListenAndServe(":8080", nil))  
}  
  
func test(w http.ResponseWriter, r *http.Request) {  
   nowtime := time.Now().Format("2006-01-02 15:04:05")  
   requests <- nowtime  
}  
  
func handleRequests() {  
   for request := range requests {  
      go myhandle(request)  
   }  
}  
  
func myhandle(request string) {  
   fmt.Println(request)  
}
```

这种方法在处理比较的小的并发业务时没有什么问题，但是，一旦并发量非常大的时候，会创建非常多的 goroutine 去处理业务，这就会把所在机器负载打的很高，甚至导致宕机。因此，对于并发量很大的业务，需要控制并发量，也就是控制 goroutine 的数量。

## 控制并发量
看下面的例子：

定义一个全局的缓冲区为100的 channel 变量 size，在 myhandle 函数处理业务逻辑时，往该  channel 里写入一个数值，处理完成后再读取该 channel 一个值。在这种情况下，当并发量超过100时，size 这个 channel 就会被堵塞，因此最多只会有100个 goroutine 在同时处理业务，这样就达到了控制并发的效果。
```
var size = make(chan int, 100)

func handleRequests() {  
   for request := range requests {  
      go myhandle(request)  
   }  
}  
  
func myhandle(request string) {  
   size <- 1  
   fmt.Println(request)  
   // 模拟业务处理
   time.Sleep(time.Second)  
   <-size  
}
```

虽然这个例子可以控制并发量，但是有一个问题。尽管最多只会有100个 goroutine 在并发处理，但是 handleRequests 函数为每个请求都创建了一个 goroutine，当并发量达到10000时，会有10000个 goroutine 被创建而只有100个在执行，由于每创建一个 goroutine 也是会消耗资源的，这样就会导致并发量越来越大的时候，程序会不断消耗资源，也可能出现机器负载很高甚至宕机的情况。因此，我们还要控制创建 goroutine 的数量。

## 控制goroutine数量
这里将上面的例子改进一下，在创建 goroutine 前，先往 size 这个 channel 里写入一个数值，当 size 的长度超过100后，就无法创建更多的 goroutine 了，这样就达到了控制 goroutine 数量的效果。
```
var size = make(chan int, 100)

func handleRequests() {  
   for request := range requests {  
      size <- 1  
	  go myhandle(request, size)  
   }  
}  
  
func myhandle(request string, size chan int) {  
   fmt.Println(request)  
   time.Sleep(time.Second)  
   <-size  
}
```

还有一种控制 goroutine 数量的方法，就是在程序启动时启动固定数量的 goroutine，如下：
```
package main  
  
import (  
	"fmt"  
	"log" 
	"net/http" 
	"time"
)  
  
var requests = make(chan string)  
var size = 100  
  
func main() {  
   handleRequests()  
   http.HandleFunc("/test", test)  
   log.Fatal(http.ListenAndServe(":8080", nil))  
}  
  
func test(w http.ResponseWriter, r *http.Request) {  
   nowtime := time.Now().Format("2006-01-02 15:04:05")  
   requests <- nowtime  
}  
  
func handleRequests() {  
   for i := 0; i < size; i++ {  
      go myhandle()  
   }  
}  
  
func myhandle() {  
   for request := range requests {  
      time.Sleep(time.Second)  
      fmt.Println(request)  
   }  
}
```

这种方式一般不推荐，因为在并发量很小的时候，启动的 goroutine 是一直占用资源的，造成资源浪费，因此使用第一种方式控制 goroutine 数量更佳。
