---
layout:     post
title:      "kubernetes使用securityContext和sysctl"
keywords:   "privileged,security context,sysctl in kubernetes" 
description: "kubernetes使用设置privileged的"
date:       2017-12-23
published:  true 
catalog: true
tags:
    - k8s 
    - docker 
---

## 前言
在运行一个容器时，有时候需要使用`sysctl`修改内核参数，比如`net.`、`vm.`、`kernel`等，`sysctl`需要容器拥有超级权限，容器启动时加上`--privileged`参数即可。那么，在kubernetes中是如何使用的呢？

## Security Context
kubernetes中有个字段叫`securityContext`，即`安全上下文`，它用于定义Pod或Container的权限和访问控制设置。其设置包括：

* **Discretionary Access Control: 根据用户ID（UID）和组ID（GID）来限制其访问资源（如：文件）的权限**

针对pod设置：

```
apiVersion: v1
kind: Pod
metadata:
  name: security-context-demo
spec:
  securityContext:
    runAsUser: 1000
    fsGroup: 2000
  volumes:
  - name: sec-ctx-vol
    emptyDir: {}
  containers:
  - name: sec-ctx-demo
    image: gcr.io/google-samples/node-hello:1.0
    volumeMounts:
    - name: sec-ctx-vol
      mountPath: /data/demo
    securityContext:
      allowPrivilegeEscalation: false
```

针对container设置：

```
apiVersion: v1
kind: Pod
metadata:
  name: security-context-demo-2
spec:
  securityContext:
    runAsUser: 1000
  containers:
  - name: sec-ctx-demo-2
    image: gcr.io/google-samples/node-hello:1.0
    securityContext:
      runAsUser: 2000
      allowPrivilegeEscalation: false
```

* **Security Enhanced Linux (SELinux): 给容器指定SELinux labels**

```
...
securityContext:
  seLinuxOptions:
    level: "s0:c123,c456"
```

* **Running as privileged or unprivileged：以`privileged`或`unprivileged`权限运行**

```
apiVersion: v1
kind: Pod
metadata:
  name: security-context-demo-4
spec:
  containers:
  - name: sec-ctx-4
    image: gcr.io/google-samples/node-hello:1.0
    securityContext:
      privileged: true
```

* **Linux Capabilities: 给某个特定的进程privileged权限，而不用给root用户所有的`privileged`权限**

```
apiVersion: v1
kind: Pod
metadata:
  name: security-context-demo-4
spec:
  containers:
  - name: sec-ctx-4
    image: gcr.io/google-samples/node-hello:1.0
    securityContext:
      capabilities:
        add: ["NET_ADMIN", "SYS_TIME"]
```

* **AppArmor: 使用程序文件来限制单个程序的权限**

* **Seccomp: 限制一个进程访问文件描述符的权限**

* **AllowPrivilegeEscalation: 控制一个进程是否能比其父进程获取更多的权限，`AllowPrivilegeEscalation`的值是bool值，如果一个容器以privileged权限运行或具有`CAP_SYS_ADMIN`权限，则`AllowPrivilegeEscalation`的值将总是true。**

```
apiVersion: v1
kind: Pod
metadata:
  name: security-context-demo-2
spec:
  securityContext:
    runAsUser: 1000
  containers:
  - name: sec-ctx-demo-2
    image: gcr.io/google-samples/node-hello:1.0
    securityContext:
      runAsUser: 2000
      allowPrivilegeEscalation: false
```

**注意：要开启容器的privileged权限，需要提前在`kube-apiserver`和`kubelet`启动时添加参数`--allow-privileged=true`，默认已添加。**
		
## 使用sysctl
`sysctl -a`可以获取sysctl所有参数列表。

从v1.4开始，kubernetes将sysctl分为`safe`和`unsafe`，其对safe的sysctl定义如下：

* 不会影响该节点的其他pod
* 不会影响节点的正常运行
* 不会获取超出`resource limits`范围的CPU和内存资源

目前属于`safe sysctl`的有：

* kernel.shm_rmid_forced
* net.ipv4.ip_local_port_range
* net.ipv4.tcp_syncookies

其余的都是`unsafe sysctl`，当kubelet支持更好的隔离机制时，`safe sysctl`列表将在未来的Kubernetes版本中扩展。

使用`safe sysctl`例子:
```
apiVersion: v1
kind: Pod
metadata:
  name: sysctl-example
  annotations:
    security.alpha.kubernetes.io/sysctls: kernel.shm_rmid_forced=1
spec:
  ...
```

而使用`unsafe sysctl`时，需要在kubelet的启动参数中指定`--experimental-allowed-unsafe-sysctls`，如`--experimental-allowed-unsafe-sysctls=net.core.somaxconn`，具体操作如下:

编辑kubelet配置文件，修改`ExecStart=/usr/bin/kubelet`那一行，在后面加上`--experimental-allowed-unsafe-sysctls=net.core.somaxconn`，如：
```
ExecStart=/usr/bin/kubelet --experimental-allowed-unsafe-sysctls=net.core.somaxconn
```

因为我是用kubeadm安装的kubernetes，所以在`/etc/systemd/system/kubelet.service.d/10-kubeadm.conf`文件中加了倒数第3行内容：
```
[Service]
Environment="KUBELET_KUBECONFIG_ARGS=--bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kubelet.conf"
Environment="KUBELET_SYSTEM_PODS_ARGS=--pod-manifest-path=/etc/kubernetes/manifests --allow-privileged=true"
Environment="KUBELET_NETWORK_ARGS=--network-plugin=cni --cni-conf-dir=/etc/cni/net.d --cni-bin-dir=/opt/cni/bin"
Environment="KUBELET_DNS_ARGS=--cluster-dns=10.96.0.10 --cluster-domain=cluster.local"
Environment="KUBELET_AUTHZ_ARGS=--authorization-mode=Webhook --client-ca-file=/etc/kubernetes/pki/ca.crt"
Environment="KUBELET_CADVISOR_ARGS=--cadvisor-port=0"
Environment="KUBELET_CGROUP_ARGS=--cgroup-driver=systemd"
Environment="KUBELET_CERTIFICATE_ARGS=--rotate-certificates=true --cert-dir=/var/lib/kubelet/pki"
Environment="KUBELET_EXTRA_ARGS=--experimental-allowed-unsafe-sysctls=net.core.somaxconn"
ExecStart=
ExecStart=/usr/bin/kubelet $KUBELET_KUBECONFIG_ARGS $KUBELET_SYSTEM_PODS_ARGS $KUBELET_NETWORK_ARGS $KUBELET_DNS_ARGS $KUBELET_AUTHZ_ARGS $KUBELET_CADVISOR_ARGS $KUBELET_CGROUP_ARGS $KUBELET_CERTIFICATE_ARGS $KUBELET_EXTRA_ARGS
```

重启kubelet：
```
systemctl daemon-reload
systemctl restart kubelet
```

在Deployment中使用`unsafe sysctl`，开启privileged权限：

```
apiVersion: v1
kind: Pod
metadata:
  name: sysctl-example
  annotations:
    security.alpha.kubernetes.io/unsafe-sysctls: net.core.somaxconn=65535                 #使用unsafe sysctl，设置最大连接数
spec:
  securityContext:
    privileged: true                                                                      #开启privileged权限
  ...
```

## 总结
线上环境请谨慎使用`privileged`权限，使用不慎可能导致整个容器崩掉，相关信息可自行查阅。

参考：  
[https://kubernetes.io/docs/concepts/cluster-administration/sysctl-cluster/](https://kubernetes.io/docs/concepts/cluster-administration/sysctl-cluster/)  
[https://kubernetes.io/docs/tasks/configure-pod-container/security-context/](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)  
