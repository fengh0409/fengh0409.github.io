---
layout:     post
title:      "k8s之pod亲和性与反亲和性的topologyKey"
keywords:   "k8s,topologyKey,topology,pod affinity,可用区" 
description: "亲和性与反亲和性的可用区"
date:       2019-03-31
published:  true 
catalog: true
tags:
    - kubernetes 
---

## Pod亲和性与反亲和性
Pod 间的亲和性与反亲和性根据已经在 Node 上运行的 Pod 的标签来调度新的 Pod 到哪个 Node 上，这些规则的形式是：

> 如果 X 已经运行一个或多个符合规则 Y 的 Pod，那么这个 Pod 应该（如果是反亲和性，则不应该）运行在 X 上。

和 Node不同，由于 Pod 都是有命名空间的，所以基于 Pod 标签的标签选择器（Label Selector）必须指定命名空间。可以通过 `namespaces`（与 `labelSelector` 和 `topologyKey` 同一级） 指定，默认情况下为拥有亲和性（或反亲和性）的 Pod 所属的命名空间，如果定义了 `namespaces` 但值是空的，则表示使用 `all` 命名空间。

那么，我需要 Pod 亲和性或反亲和性的同时，又能指定 Pod 调度到某个 Node 该如何处理呢？这就要用到接下来讲的 `topologyKey` 了。

## 什么是topologyKey
顾名思义，`topology` 就是 `拓扑` 的意思，这里指的是一个 `拓扑域`，是指一个范围的概念，比如一个 Node、一个机柜、一个机房或者是一个地区（如杭州、上海）等，实际上对应的还是 Node 上的标签。这里的 `topologyKey` 对应的是 Node 上的标签的 Key（没有Value），可以看出，其实 `topologyKey` 就是用于筛选 Node 的。通过这种方式，我们就可以将各个 Pod 进行跨集群、跨机房、跨地区的调度了。

## 如何使用topologyKey
看下面的例子：
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-pod-affinity
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
          - key: security
            operator: In
            values:
            - S1
        topologyKey: failure-domain.beta.kubernetes.io/zone
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
            - key: security
              operator: In
              values:
              - S2
          topologyKey: kubernetes.io/hostname
  containers:
  - name: with-pod-affinity
    image: k8s.gcr.io/pause:2.0
```

这里 Pod 的亲和性规则是：这个 Pod 要调度到的 Node 必须有一个标签为 `security: S1` 的 Pod，且该 Node 必须有一个 Key 为 `failure-domain.beta.kubernetes.io/zone`  的 标签，即 Node 必须属于 `failure-domain.beta.kubernetes.io/zone` 拓扑域。

Pod 的反亲和性规则是：这个 Pod 尽量不要调度到这样的 Node，其包含一个 Key 为 `kubernetes.io/hostname` 的标签，且该 Node 上有标签为 `security: S2` 的 Pod。


## topologyKey详解
既然 `topologyKey` 是拓扑域，那 Pod 之间怎样才是属于同一个拓扑域？

如果使用 `k8s.io/hostname`，则表示拓扑域为 Node 范围，那么 `k8s.io/hostname` 对应的值不一样就是不同的拓扑域。比如 Pod1 在 `k8s.io/hostname=node1` 的 Node 上，Pod2 在 `k8s.io/hostname=node2` 的 Node 上，Pod3 在 `k8s.io/hostname=node1` 的 Node 上，则 Pod2 和 Pod1、Pod3 不在同一个拓扑域，而Pod1 和 Pod3在同一个拓扑域。

如果使用 `failure-domain.k8s.io/zone` ，则表示拓扑域为一个区域。同样，Node 的标签 `failure-domain.k8s.io/zone` 对应的值不一样也不是同一个拓扑域，比如 Pod1 在 `failure-domain.k8s.io/zone=beijing` 的 Node 上，Pod2 在 `failure-domain.k8s.io/zone=hangzhou` 的 Node 上，则 Pod1 和 Pod2 不属于同一个拓扑域。

当然，topologyKey 也可以使用自定义标签。比如可以给一组 Node 打上标签 `custom_topology`，那么拓扑域就是针对这个标签了，则该标签相同的 Node 上的 Pod 属于同一个拓扑域。


## 注意事项
原则上，topologyKey 可以是任何合法的标签 Key。但是出于性能和安全原因，对 topologyKey 有一些限制：

1. 对于亲和性和 `requiredDuringSchedulingIgnoredDuringExecution` 的 Pod 反亲和性，topologyKey 不能为空。
2. 对于 `requiredDuringSchedulingIgnoredDuringExecution` 的 Pod 反亲和性，引入 `LimitPodHardAntiAffinityTopology` 准入控制器来限制 topologyKey 只能是 `kubernetes.io/hostname`。如果要使用自定义拓扑域，则可以修改准入控制器，或者直接禁用它。
3. 对于 `preferredDuringSchedulingIgnoredDuringExecution` 的 Pod 反亲和性，空的 topologyKey 表示所有拓扑域。截止 `v1.12` 版本，所有拓扑域还只能是 `kubernetes.io/hostname`、`failure-domain.beta.kubernetes.io/zone` 和 `failure-domain.beta.kubernetes.io/region` 的组合。
4. 除上述情况外，topologyKey 可以是任何合法的标签 key。


## 参考
* [https://k8smeetup.github.io/docs/concepts/configuration/assign-pod-node/](https://k8smeetup.github.io/docs/concepts/configuration/assign-pod-node/)
* [https://www.cnblogs.com/cocowool/p/kubernetes_affinity.html](https://www.cnblogs.com/cocowool/p/kubernetes_affinity.html)
* [https://segmentfault.com/a/1190000018446833#articleHeader6](https://segmentfault.com/a/1190000018446833#articleHeader6)

