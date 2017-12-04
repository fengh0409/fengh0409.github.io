---
layout:     post
title:      "kubernetes的资源管理"
keywords:   "kubernetes,resource quotas,qos" 
description: "kubernetes资源管理"
date:       2017-12-04
published:  false 
catalog: true
tags:
    - k8s 
    - docker 
---

## 什么是资源
Kubernetes中，资源指的是可以被pod或容器“请求”,“分配”,“消费”的那些东西。例如：CPU，内存，硬盘。资源又分为可压缩资源和不可压缩资源，目前CPU是唯一支持的可压缩资源，内存和硬盘是不可压缩资源。对于CPU这种可压缩资源，如果pod中服务使用CPU超过限额，pod不会被kill掉但会被限制，而对于内存这种不可压缩资源，如果pod中服务使用内存超过限额，pod中容器的进程会因OOM（Out of Memory）被kernel kill掉。

## 资源限制
如果未做过节点nodeSelector、亲和性（node affinity）或pod亲和、反亲和性（pod affinity/anti-affinity）等[Pod高级调度策略设置](http://dockone.io/article/2635)，我们无法指定pod部署到指定机器上，这可能会造成CPU或内存等密集型的pod同时分配到相同节点，造成资源竞争。另一方面，如果未对资源进行限制，一些关键的服务可能会因为资源竞争因OOM等原因被kill掉，或者被限制使用CPU。

### CPU、内存资源
在部署pod时，可以指定每个容器的资源请求和资源限额。分别由requests和limits控制：

* requests：资源请求，表示需要多少资源。
* limits：  资源限制，表示最多可以使用多少资源。

**注：requests设置范围是0到节点最大配置，即0 <= request <= Node Allocatable，而limits设置范围是requests到无穷大，即requests <= limits <= Infinity。**

当给一个容器指定了resource requests时，调度器可以更好地决定将pod放在哪个node上。目前容器仅支持CPU和内存资源的requests和limits。

#### 演示
下面启动一个可以不断申请内存的应用，测试一个容器使用内存超过限额后，k8s如何处理。

deployment配置如下：
```yaml
apiVersion: extensions/v1beta1 
kind: Deployment               
metadata:
  name: test-oom               
spec:
  replicas: 3                  
  template:
    metadata:
      labels:                  
        app: test-oom          
    spec:                      
      containers:              
        - name: test-oom       
          image: test-oom
          resources:           
            requests:          
              memory: 60Mi     
              cpu: 1
            limits:
              memory: 200Mi
              cpu: 2
```
该配置表示应用有3个pod，每个容器请求60MB内存、1颗CPU，限额1GB内存、2颗CPU

创建deployment：
```yaml
```
查看各个pod的状态：
```shell
```

打开一个新的终端窗口A，随便进入一台节点服务器，比如docker22，通过docker stats查看该节点的test-oom容器的资源占用情况，发现一切正常。
```shell
```

然后在原来的终端执行curl http://10.244.0.87:8080/kill（该接口是一个不断申请内存的死循环程序），并返回终端A再次查看资源占用情况，会发现内存占用在飙升，而且docker stats很快就停止刷新了。结果如下：
```shell
```

这是因为该pod被kill掉了，然后pod重启并重新启动了一个新的容器。查看pod状态，发现该pod的RESTART变为1了，说明该pod重启过一次，如下：
```shell```
```

### 硬盘资源

## Resource Quotas

## LimitRange

## 配置代理

## QoS

## 总结

