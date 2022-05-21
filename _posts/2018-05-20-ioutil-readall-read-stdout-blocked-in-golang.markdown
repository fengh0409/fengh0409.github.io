---
layout:     post
title:      "Go的ioutil.ReadAll()读取标准输出的问题"
keywords:   "command,stdout,stderr,readall,combinedoutput,blocked,读取标准输出挂起" 
description: "ioutil.ReadAll读取标准输出问题"
date:       2018-05-20
published:  true 
catalog: true
tags:
    - go 
---

## 问题描述
之前在使用`ioutil.ReadAll()`读取`cmd.CombinedOutput()`的标准输出时遇到程序挂起的问题，代码如下：
```
func main() {
    cmd := exec.Command("git", "clone","https://github.com/test/test.git")
    stdout, _ := cmd.StdoutPipe()
    stderr, _ := cmd.StderrPipe()
    if err := cmd.Run(); err != nil {
        fmt.Printf("run error:%s\n",err)
        return
    }
    stderrBytes, _ := ioutil.ReadAll(stderr)
    stdoutBytes, _ := ioutil.ReadAll(stdout)
    if len(stderrBytes) > 0 {
        fmt.Printf("stderr:%s\n", stderrBytes)
        return
    }
    fmt.Printf("stdout:%s\n", stdoutBytes)
}
```

执行代码后发现程序挂起了，并没有结果打印出来。开始调试、换用`cmd`的其他方法，代码如下：
```
func main() {
    cmd := exec.Command("git", "clone","https://github.com/test/test.git")
    stdout, _ := cmd.StdoutPipe()
    stderr, _ := cmd.StderrPipe()
    if err := cmd.Start(); err != nil {
        fmt.Println(err)
        return
    }
    if err := cmd.Wait(); err != nil {
        fmt.Println(err)
        return
    }
    stderrBytes, _ := ioutil.ReadAll(stderr)
    stdoutBytes, _ := ioutil.ReadAll(stdout)
    if len(stderrBytes) > 0 {
        fmt.Printf("stderr:%s\n", stderrBytes)
        return
    }
    fmt.Printf("stdout:%s\n", stdoutBytes)
}
```

一顿操作之后，问题仍然没有解决，于是开启Google+Stack Overflow模式，最终找到`golang`项目的一个issue。

## 解决方案
这个issue描述的和我遇到的问题一样，有人给出了解决方案，截取内容如下：
> This is unfortunately just how Unix pipes work. You need to read from both pipes at the same time. What's happening is that cat is trying to write to stdout, but its attempt to write is blocked because the stdout buffer is full. You're trying to ReadAll from stderr, but stderr won't be closed until cat exits, which won't happen until it finishes writing to stdout. So, deadlock.  
>
> This is why Command provides Output and CombinedOutput methods; they are careful to always read from both pipes at once. If you want both stdout and stderr but not in the same byte slice, you can also do what CombinedOutput does under the covers and assign separate bytes.Buffer to Stdout and Stderr. Or you can just use Goroutines to read from both at once.

意思就是说`cat`指令尝试往`stdout`里面写数据，但因为stdout buffer满了导致这个写操作被堵住了，这时`ReadAll`函数尝试从`stderr`读数据，但`stderr`只有在`cat`指令退出才会被关闭，而`cat`指令只有往`stdout`里写完了才会退出，so，最终导致死锁了。原文地址：[https://github.com/golang/go/issues/16787](https://github.com/golang/go/issues/16787)

解决方法如下：
```
func main() {
    cmd := exec.Command("git", "clone","https://github.com/test/test.git")
    var stdout, stderr bytes.Buffer
    cmd.Stdout = &stdout
    cmd.Stderr = &stderr
    if err := cmd.Run(); err != nil {
        fmt.Printf("stderr:%s\n", stderr.Bytes())
        return
    }
    fmt.Printf("stdout:%s\n", stdout.Bytes())
}

```

若不需要单独获取stdout和stderr，使用`CombinedOutput`或`Output`即可，如下：
```
func main() {
    cmd := exec.Command("git", "clone","https://github.com/test/test.git")
    stdoutStderr, err := cmd.CombinedOutput()
    // stdoutStderr, err := cmd.Output()
    if err != nil {
        fmt.Printf("stderr:%s\n", stdoutStderr)
        return
    }
    fmt.Printf("stdout:%s\n", stdoutStderr)
}

```


## 总结
遇到问题善用该项目GitHub的issue，到issue里搜一搜，绝大多数问题都能找到答案。
