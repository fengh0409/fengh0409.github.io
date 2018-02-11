---
layout:     post
title:      "kubernetes的资源管理"
keywords:   "kubernetes,资源管理,资源配额,资源限制,resource quotas,qos" 
description: "kubernetes资源管理"
date:       2017-12-04
published:  true 
catalog: true
tags:
    - k8s 
    - docker 
---

## 什么是资源
在Kubernetes中，资源指的是可以被pod或容器“请求”,“分配”,“消费”的那些东西。例如：CPU，内存，硬盘。资源又分为可压缩资源和不可压缩资源，目前CPU是唯一支持的可压缩资源，内存和硬盘是不可压缩资源。对于CPU这种可压缩资源，如果pod中服务使用CPU超过限额，该pod不会被kill掉但会被限制，而对于内存这种不可压缩资源，如果pod中服务使用内存超过限额，该pod中容器的进程会因OOM（Out of Memory）被kernel kill掉。

## 资源限制
如果未做过节点nodeSelector、亲和性（node affinity）或pod亲和、反亲和性（pod affinity/anti-affinity）等[Pod高级调度策略设置](http://dockone.io/article/2635)，我们无法指定pod部署到指定机器上，这可能会造成CPU或内存等密集型的pod同时分配到相同节点，造成资源竞争。另一方面，如果未对资源进行限制，一些关键的服务可能会因为资源竞争因OOM等原因被kill掉，或者被限制使用CPU。

#### CPU、内存资源
在部署pod时，可以指定每个容器的资源请求和资源限额。分别由requests和limits控制：

* requests：资源请求，表示需要多少资源。
* limits：  资源限制，表示最多可以使用多少资源。

**注：requests设置范围是0到节点最大配置，即0 <= request <= Node Allocatable，而limits设置范围是requests到无穷大，即requests <= limits <= Infinity。**

当给一个容器指定了`resource requests`时，调度器可以更好地决定将pod放在哪个node上，目前容器仅支持CPU和内存资源的requests和limits。

###### 内存溢出示例
下面是一个测试内存溢出的示例，启动一个可以不断申请内存的应用，测试一个容器使用内存超过限额后，kubernetes将如何处理。Deployment配置如下：
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
[root@docker22 kubernetes]# kubectl create -f test-oom.yml 
deployment "test-oom" created
```

查看各个pod的状态：
```
[root@docker22 kubernetes]# kubectl get pod -o wide
NAME                        READY     STATUS    RESTARTS   AGE       IP             NODE
test-oom-85b67d8699-mwwbt   1/1       Running   0          6s        10.244.2.120   docker24
test-oom-85b67d8699-nzjw2   1/1       Running   0          6s        10.244.0.134   docker22
test-oom-85b67d8699-tsdcp   1/1       Running   0          6s        10.244.1.88    docker23
```

打开一个新的终端窗口A，随便进入一台节点服务器，比如docker22，先找到test-oom容器id，通过docker stats查看该节点的test-oom容器的资源占用情况，发现一切正常。
```
[root@docker22 kubernetes]# docker ps|grep test-oom
69f66c496f69        test-oom@sha256:5ac78c8c3ee39798a75507608f9815892b43e73051fb9580210471b1b624a242                       "sh -c /tmp/test-oom"    2 minutes ago       Up 2 minutes                               k8s_test-oom_test-oom-85b67d8699-nzjw2_default_1dac89e0-dcaa-11e7-8280-001517872530_0
75f63eff0507        gcr.io/google_containers/pause-amd64:3.0                                                                                         "/pause"                 2 minutes ago       Up 2 minutes 
[root@docker22 kubernetes]# docker stats|grep 69f66c496f69
69f66c496f69        0.00%               1.406 MiB / 200 MiB     0.70%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.406 MiB / 200 MiB     0.70%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.406 MiB / 200 MiB     0.70%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.406 MiB / 200 MiB     0.70%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.406 MiB / 200 MiB     0.70%               0 B / 0 B           0 B / 0 B           6
```

然后在原来的终端执行curl http://10.244.0.87:8080/kill（该接口是一个不断申请内存的死循环程序），并返回终端A再次查看资源占用情况，会发现内存占用在飙升，而且docker stats很快就停止刷新了。结果如下：
```
[root@docker22 kubernetes]# docker stats|grep 69f66c496f69
69f66c496f69        0.00%               1.414 MiB / 200 MiB     0.71%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.414 MiB / 200 MiB     0.71%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.414 MiB / 200 MiB     0.71%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.414 MiB / 200 MiB     0.71%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.414 MiB / 200 MiB     0.71%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        0.00%               1.414 MiB / 200 MiB     0.71%               0 B / 0 B           0 B / 0 B           6
69f66c496f69        71.59%              26.91 MiB / 200 MiB     13.45%              0 B / 0 B           242 kB / 0 B        11
69f66c496f69        71.59%              26.91 MiB / 200 MiB     13.45%              0 B / 0 B           242 kB / 0 B        11
69f66c496f69        243.48%             83.75 MiB / 200 MiB     41.88%              0 B / 0 B           242 kB / 0 B        12
69f66c496f69        243.48%             83.75 MiB / 200 MiB     41.88%              0 B / 0 B           242 kB / 0 B        12
69f66c496f69        131.74%             137.5 MiB / 200 MiB     68.75%              0 B / 0 B           242 kB / 0 B        12
69f66c496f69        131.74%             137.5 MiB / 200 MiB     68.75%              0 B / 0 B           242 kB / 0 B        12
```

这是因为该pod被kill掉了，然后pod重启，所以容器也重启了。查看pod状态，发现该pod的RESTART变为1了，说明该pod重启过一次，如下：
```
[root@docker22 kubernetes]# kubectl get pod -o wide
NAME                        READY     STATUS    RESTARTS   AGE       IP             NODE
test-oom-85b67d8699-mwwbt   1/1       Running   0          8m        10.244.2.120   docker24
test-oom-85b67d8699-nzjw2   1/1       Running   1          8m        10.244.0.134   docker22
test-oom-85b67d8699-tsdcp   1/1       Running   0          8m        10.244.1.88    docker23
```

#### 硬盘资源
###### emptyDir
卷，该类型的挂载卷可以使用宿主机全部的硬盘空间，要注意的是，emptyDir类型的挂载卷生命周期持续到Pod终止，即使Pod内的容器重启或终止，只要Pod存活，该挂载卷也会一直存在。只有当Pod终止时，挂载卷的数据才会被清除。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: test-pd
spec:
  containers:
  - image: gcr.io/google_containers/test-webserver
    name: test-container
    volumeMounts:
    - mountPath: /cache
      name: cache-volume
  volumes:
  - name: cache-volume
    emptyDir: {}
```

###### PersistentVolume
持久卷，缩写为PV，是集群中的一块存储，跟Node一样，也是集群的资源。PV跟Volume(卷)类似，不过它有独立于Pod的生命周期，该类型挂载卷是永久存在于宿主机的。
```yaml
kind: PersistentVolume         
apiVersion: v1                 
metadata:
  name: task-pv-volume         
  labels:                      
    type: local                
spec:
  storageClassName: manual     
  capacity:
    storage: 10Gi              
  accessModes:                 
    - ReadWriteOnce            
  hostPath:
    path: "/tmp/data"  
```

上面定义了一个PersistentVolume资源，挂载宿主机的/tmp/data目录，容量为10GB，访问模式为读写，其中定义的storageClassName=manual用于将PersistentVolumeClaim的requests绑定到这个PV。
其中，accessModes可选三种访问模式：

* ReadWriteOnce：该卷能够以读写模式被加载到一个节点上。
* ReadOnlyMany：该卷能够以只读模式加载到多个节点上。
* ReadWriteMany：该卷能够以读写模式被多个节点同时加载。
	
###### PersistentVolumeClaim
持久卷申请，缩写为PVC，是用户对PV的一个请求，跟Pod类似。Pod消费Node的资源，PVC消费PV的资源。Pod 能够申请特定的资源（CPU和内存）；PVC能够申请特定的尺寸和访问模式（例如可以加载一个读写，或多个只读实例）。
```yaml
kind: PersistentVolumeClaim    
apiVersion: v1                 
metadata:
  name: task-pv-claim          
spec:
  storageClassName: manual     
  accessModes:                 
    - ReadWriteOnce            
  resources:                   
    requests:
      storage: 3Gi  
```

###### 示例
在Pod中使用PVC，yaml配置文件如下：
```yaml
kind: Pod
apiVersion: v1
metadata:
  name: task-pv-pod
spec:
  volumes:
    - name: task-pv-storage
      persistentVolumeClaim:
       claimName: task-pv-claim
  containers:
    - name: task-pv-container
      image: nginx
      ports:
        - containerPort: 80
          name: "http-server"
      volumeMounts:
        - mountPath: "/usr/share/nginx/html"
          name: task-pv-storage
```
这里创建了一个PVC类型的资源，PVC创建后，k8s的controller会去查找匹配的PV，一旦找到，则通过storageClassName与其绑定，申请PV 3GB硬盘空间，实际上就是宿主机3GB硬盘空间。

**注意：PVC绑定是独占的，即一旦PVC与某个PV绑定，其他的PVC就不能再绑定到这个PV了。**

## Resource Quotas
资源配额（Resource Quotas）是用来限制用户资源用量的一种机制。

它的工作原理为：

* 资源配额应用在Namespace上，并且每个Namespace最多只能有一个ResourceQuota对象
* 开启计算资源配额后，创建容器时必须配置计算资源请求或限制（也可以用LimitRange设置默认值）
* 用户超额后禁止创建新的资源


资源配额的类型：
   
* 计算资源，包括cpu和内存
    > cpu, limits.cpu, requests.cpu
    > memory, limits.memory, requests.memory

* 存储资源，包括存储资源的总量以及指定storage class的总量
    > requests.storage：存储资源总量，如500Gi
    > persistentvolumeclaims：pvc的个数

* 对象数，即可创建的对象的个数
    > pods, replicationcontrollers, configmaps, secrets
    > resourcequotas, persistentvolumeclaims
    > services, services.loadbalancers, services.nodeports

资源配额示例
```yaml
apiVersion: v1
kind: ResourceQuota            
metadata:
  name: resource-quotas        
spec:
  hard:                        
    pods: "4"                  
    requests.cpu: "1"          
    requests.memory: 1Gi       
    limits.cpu: "2"            
    limits.memory: 2Gi         
    persistentvolumeclaims: "10" 
```

该配置表示，该命名空间下
> 最多只能有4个pod
> CPU请求1核，限制2核
> 内存请求1GB，限制2GB
>最多可以声明10个PVC
	
###使用示例
创建myspace命名空间：
```
[root@docker22 kubernetes]# kubectl create namespace myspace
namespace "myspace" created	
```

创建myspace命名空间的资源配额对象：
```
[root@docker22 kubernetes]# kubectl create -f resoureQuota.yml -n myspace
resourcequota "resource-quotas" created
```

查看该命名空间下资源配额占用情况：
```
[root@docker22 kubernetes]# kubectl describe quota/resource-quotas -n myspace
Name:                   resource-quotas
Namespace:              myspace
Resource                Used  Hard
--------                ----  ----
limits.cpu              0     2
limits.memory           0     2Gi
persistentvolumeclaims  0     10
pods                    0     4
requests.cpu            0     1
requests.memory         0     1Gi
```

编写应用app-myspace.yaml配置，如下：
```yaml
apiVersion: extensions/v1beta1 
kind: Deployment               
metadata:
  name: app-myspace         
spec:
  replicas: 3                  
  template:
    metadata:                  
      labels:                  
        app: app-myspace    
    spec:
      containers:              
      - name: app-myspace   
        image: app-myspace:k8s-test
        resources:             
          requests:
            memory: 100Mi      
            cpu: 100m          
          limits:              
            memory: 500Mi      
            cpu: 500m
```

创建Deployment：
```
[root@docker22 kubernetes]# kubectl create -f app-myspace.yml -n myspace
deployment "app-myspace" created
```

查看pod的状态，正常：
[root@docker22 kubernetes]# kubectl get pod -n myspace -o wide
NAME                              READY     STATUS    RESTARTS   AGE       IP             NODE
app-myspace-7d64df76c7-8cpjj   1/1       Running   0          4m        10.244.0.135   docker22
app-myspace-7d64df76c7-fb6xl   1/1       Running   0          4m        10.244.1.89    docker23
app-myspace-7d64df76c7-p5w24   1/1       Running   0          4m        10.244.2.121   docker24

查看资源占用情况：
```
[root@docker22 kubernetes]# kubectl describe quota/resource-quotas -n myspace
Name:                   resource-quotas
Namespace:              myspace
Resource                Used    Hard
--------                ----    ----
limits.cpu              1500m   2
limits.memory           1500Mi  2Gi
persistentvolumeclaims  0       10
pods                    3       4
requests.cpu            300m    1
requests.memory         300Mi   1Gi
```

**注意：若把上述resource.limits.cpu改为1，则启动3个pod需要3颗CPU，而我们在Resource quota里声明了limits.cpu=2，无法满足创建3个pod的条件，所以这种情况下只能创建2个pod。**

## LimitRange
默认情况下，Kubernetes中所有容器都没有任何CPU和内存限制。LimitRange用来给Namespace增加一个默认资源限制，包括最小、最大值。

配置示例：
```yaml
apiVersion: v1
kind: LimitRange               
metadata:      
  name: mylimits               
spec:                          
  limits:
  - max:
      cpu: "2"                 
      memory: 1Gi
    min:
      cpu: 200m                
      memory: 6Mi              
    type: Pod                  
  - default:
      cpu: 300m
      memory: 200Mi            
    defaultRequest:            
      cpu: 200m                
      memory: 100Mi            
    max:
      cpu: "2"
      memory: 1Gi
    min:
      cpu: 100m
      memory: 3Mi
    type: Container
```
该配置表示，默认情况下：
> 一个Pod内所有容器内存使用最小6M，最大1G；CPU使用最小200m，最大2核。
> 一个容器内存使用最小3M，最大1G，requests 100M，limits 200M；CPU使用最小100m，最大2核，requests 200m，limits 300m。

若一个Pod的资源限制条件不满足该namespace下的limitRange，则该Pod不会被创建。即必须满足以下条件：`min <= request <= limit <= max`

## QoS
QoS是Quality of Service的缩写，即服务质量。为了实现资源被有效调度和分配的同时提高资源利用率，Kubernetes针对不同服务质量的预期，通过QoS（Quality of Service）来对pod进行服务质量管理。对于一个pod来说，服务质量体现在两个具体的指标：CPU和内存。当节点上内存资源紧张时，kubernetes会根据预先设置的不同QoS类别进行相应处理。

QoS主要分为Guaranteed、Burstable和Best-Effort三类，优先级从高到低。

#### Guaranteed
属于该级别的pod有以下两种：
1. Pod中的所有容器都且仅设置了CPU和内存的limits
2. pod中的所有容器都设置了CPU和内存的requests和limits，且单个容器内的requests==limits（requests不等于0）

pod中的所有容器都且仅设置了limits：
```yaml
containers:
  name: foo
    resources:
      limits:
        cpu: 10m
        memory: 1Gi
  name: bar
    resources:
      limits:
        cpu: 100m
        memory: 100Mi
```

pod中的所有容器都设置了requests和limits，且单个容器内的requests==limits：
```yaml
containers:
  name: foo
    resources:
      limits:
        cpu: 10m
        memory: 1Gi
      requests:
        cpu: 10m
        memory: 1Gi

  name: bar
    resources:
      limits:
        cpu: 100m
        memory: 100Mi
      requests:
        cpu: 100m
        memory: 100Mi
```
容器foo和bar内resources的requests和limits均相等，该pod的QoS级别属于Guaranteed。

#### Burstable
pod中只要有一个容器的requests和limits的设置不相同，该pod的QoS即为Burstable。

容器foo指定了resource，而容器bar未指定：
```yaml
containers:
  name: foo
    resources:
      limits:
        cpu: 10m
        memory: 1Gi
      requests:
        cpu: 10m
        memory: 1Gi

  name: bar
```

容器foo设置了内存limits，而容器bar设置了CPU limits：
```yaml
containers:
  name: foo
    resources:
      limits:
        memory: 1Gi

  name: bar
    resources:
      limits:
        cpu: 100m
```

**注意：若容器指定了requests而未指定limits，则limits的值等于节点resource的最大值；若容器指定了limits而未指定requests，则requests的值等于limits。**

#### Best-Effort
如果Pod中所有容器的resources均未设置requests与limits，该pod的QoS即为Best-Effort。

容器foo和容器bar均未设置requests和limits：
```yaml
containers:
  name: foo
    resources:
  name: bar
    resources:
```

#### 根据QoS进行资源回收策略
Kubernetes通过cgroup给pod设置QoS级别，当资源不足时先kill优先级低的pod，在实际使用过程中，通过OOM分数值来实现，OOM分数值范围为0-1000。
OOM分数值根据OOM_ADJ参数计算得出，对于Guaranteed级别的pod，OOM_ADJ参数设置成了-998，对于Best-Effort级别的pod，OOM_ADJ参数设置成了1000，对于Burstable级别的POD，OOM_ADJ参数取值从2到999。对于kuberntes保留资源，比如kubelet，docker，OOM_ADJ参数设置成了-999，表示不会被OOM kill掉。OOM_ADJ参数设置的越大，计算出来的OOM分数越高，表明该pod优先级就越低，当出现资源竞争时会越早被kill掉，对于OOM_ADJ参数是-999的表示kubernetes永远不会因为OOM将其kill掉。

#### QoS pods被kill掉场景与顺序
*Best-Effort pods：系统用完了全部内存时，该类型pods会最先被kill掉。   
*Burstable pods：系统用完了全部内存，且没有Best-Effort类型的容器可以被kill时，该类型的pods会被kill掉。  
*Guaranteed pods：系统用完了全部内存，且没有Burstable与Best-Effort类型的容器可以被kill时，该类型的pods会被kill掉。  

#### QoS使用建议
如果资源充足，可将QoS pods类型均设置为Guaranteed。用计算资源换业务性能和稳定性，减少排查问题时间和成本。如果想更好的提高资源利用率，业务服务可以设置为Guaranteed，而其他服务根据重要程度可分别设置为Burstable或Best-Effort。

## 总结
kubernetes中的资源是很大一块内容，本文还有些东西没有讲到，因为我也没搞清楚，有兴趣的可以去官网查阅文档了解下。

参考：  
[https://feisky.gitbooks.io/kubernetes/concepts/quota.html](https://feisky.gitbooks.io/kubernetes/concepts/quota.html)  
[https://github.com/kubernetes/community/blob/master/contributors/design-proposals/node/resource-qos.md](https://github.com/kubernetes/community/blob/master/contributors/design-proposals/node/resource-qos.md)  
[http://dockone.io/article/2592](http://dockone.io/article/2592)  
