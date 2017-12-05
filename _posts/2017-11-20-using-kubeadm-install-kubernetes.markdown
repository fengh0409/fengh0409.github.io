---
layout:     post
title:      "使用kubeadm安装kubernetes"
keywords:   "kubeadm,kubernetes,k8s" 
description: "kubeadm安装kubernetes集群"
date:       2017-11-20
published:  true 
catalog: true
tags:
    - k8s 
    - docker 
---

## 前言
kubeadm是kubernetes官方提供的快速安装kubernetes集群的工具，相比以前手动安装各个组件，kubeadm可以说是非常方便了。我在安装的过程中遇到了很多坑，而引起这些坑的根本原因就是网络不通，因为要去拉谷歌的镜像，如果服务器没有配代理的话，会遇到各种各样的问题。所以，建议大家在安装前先配好代理，如果没有代理只能墙内安装，需要从其他镜像仓库把各个镜像拉下来，并修改各个yaml文件。下面详细介绍下我使用代理安装单master k8s集群的过程。

## 准备工作
**说明：此次安装是在CentOS 7上安装`v1.8.0`版本的k8s。**

* 检查以下端口在相应节点是否被占用

```shell
#主节点：
6443*	        Kubernetes API server
2379-2380	    etcd server client API
10250	        Kubelet API
10251	        kube-scheduler
10252	        kube-controller-manager
10255	        Read-only Kubelet API (Heapster)

#工作节点：
10250	        Kubelet API
10255	        Read-only Kubelet API (Heapster)
30000-32767    	Default port range for NodePort Services.
```

* 一些准备工作

```bash
#关闭防火墙
systemctl stop firewalld
systemctl disable firewalld

#禁用SELinux，允许容器访问宿主机的文件系统
setenforce 0

#将net.bridge.bridge-nf-call-iptables设为1
cat <<EOF >  /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
sysctl -p /etc/sysctl.d/k8s.conf

#关闭swap，Kubernetes 1.8开始要求关闭系统的Swap，如果不关闭，默认配置下kubelet将无法启动
swapoff -a
```

## 安装docker
这里我安装的是`17.03.2.ce`版本
```bash
#卸载已安装的docker
yum list installed | awk '{print $1}' | grep docker | xargs yum -y remove

yum makecache fast
yum install -y yum-utils device-mapper-persistent-data lvm2
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum list docker-ce.x86_64  --showduplicates |sort -r
yum install -y --setopt=obsoletes=0  docker-ce-17.03.2.ce-1.el7.centos  docker-ce-selinux-17.03.2.ce-1.el7.centos

#启动docker
systemctl enable docker
systemctl start docker
```

Docker从1.13版本开始调整了默认的防火墙规则，禁用了iptables filter表中FOWARD链，这样会引起Kubernetes集群中跨node的pod无法通信，在各个Docker节点执行以下命令：
```shell
iptables -P FORWARD ACCEPT
```

这里建议在各个node将该命令加入到docker的启动配置中，在/etc/systemd/system/docker.service文件中加入以下内容：
```shell
ExecStartPost=/usr/sbin/iptables -P FORWARD ACCEPT
```

然后重启docker:
```shell
systemctl daemon-reload
systemctl restart docker
```

## 配置代理
```shell
#配置全局代理
cat <<EOF >  ~/.bashrc
export http_proxy=http://username:password@ip:port
export https_proxy=http://username:password@ip:port
export no_proxy=localhost,127.0.0.1,<your-server-ip>(本机ip地址)
EOF
source ~/.bashrc	

#配置docker代理，拉谷歌镜像要用到：
mkdir -p /etc/systemd/system/docker.service.d/
cat <<EOF > /etc/systemd/system/docker.service.d/http-proxy.conf
[Service]
Environment="HTTP_PROXY=http://username:password@ip:port" "HTTPS_PROXY=http://username:password@ip:port" "NO_PROXY=localhost,127.0.0.1,<your-server-ip>"
EOF
systemctl daemon-reload
systemctl restart docker
```

## 安装kubeadm、kubelet、kubectl
配置谷歌yum源
```shell
cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF
```

安装kubeadm、kubelet、kubectl
```shell
yum install -y kubelet kubeadm kubectl
systemctl daemon-reload
systemctl enable kubelet
systemctl start kubelet
```

这里要确保docker和kubelet的cgroup driver一致，若不一致，请修改为`systemd`或`cgroupfs`。

查看docker的cgroup driver：`docker info|grep Cgroup`，kubelet的启动参数`--cgroup-driver`的默认值为cgroupfs，而yum安装kubeadm和kubelet时，生成的`/etc/systemd/system/kubelet.service.d/10-kubeadm.conf`文件将这个参数值改为了systemd。可以查看该文件的内容`cat  /etc/systemd/system/kubelet.service.d/10-kubeadm.conf|grep cgroup`。

这里修改docker的cgroup driver为`systemd`
```shell
cat << EOF > /etc/docker/daemon.json
{
  "exec-opts": ["native.cgroupdriver=systemd"]
}
EOF
```

重启docker
```shell
systemctl daemon-reload
systemctl restart docker
```

## 初始化
指定安装k8s版本为v1.8.0，第二个参数值表明pod网络指定为flannel，更多参数可以查看help
```shell
kubeadm init --kubernetes-version v1.8.0 --pod-network-cidr=10.244.0.0/16
```

因为我安装的是单master的集群，所以只在主节点服务器执行该init操作，工作节点上不要执行。

若初始化失败，执行以下命令清理一些可能存在的网络问题，然后重新初始化
```shell
kubeadm reset
ifconfig cni0 down
ip link delete cni0
ifconfig flannel.1 down
ip link delete flannel.1
rm -rf /var/lib/cni/
```

初始化完成后，你会看到如下的类似信息：
```shell
[kubeadm] WARNING: kubeadm is in beta, please do not use it for production clusters.
[init] Using Kubernetes version: v1.8.0
[init] Using Authorization modes: [Node RBAC]
[preflight] Running pre-flight checks
[kubeadm] WARNING: starting in 1.8, tokens expire after 24 hours by default (if you require a non-expiring token use --token-ttl 0)
[certificates] Generated ca certificate and key.
[certificates] Generated apiserver certificate and key.
[certificates] apiserver serving cert is signed for DNS names [kubeadm-master kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local] and IPs [10.96.0.1 10.138.0.4]
[certificates] Generated apiserver-kubelet-client certificate and key.
[certificates] Generated sa key and public key.
[certificates] Generated front-proxy-ca certificate and key.
[certificates] Generated front-proxy-client certificate and key.
[certificates] Valid certificates and keys now exist in "/etc/kubernetes/pki"
[kubeconfig] Wrote KubeConfig file to disk: "admin.conf"
[kubeconfig] Wrote KubeConfig file to disk: "kubelet.conf"
[kubeconfig] Wrote KubeConfig file to disk: "controller-manager.conf"
[kubeconfig] Wrote KubeConfig file to disk: "scheduler.conf"
[controlplane] Wrote Static Pod manifest for component kube-apiserver to "/etc/kubernetes/manifests/kube-apiserver.yaml"
[controlplane] Wrote Static Pod manifest for component kube-controller-manager to "/etc/kubernetes/manifests/kube-controller-manager.yaml"
[controlplane] Wrote Static Pod manifest for component kube-scheduler to "/etc/kubernetes/manifests/kube-scheduler.yaml"
[etcd] Wrote Static Pod manifest for a local etcd instance to "/etc/kubernetes/manifests/etcd.yaml"
[init] Waiting for the kubelet to boot up the control plane as Static Pods from directory "/etc/kubernetes/manifests"
[init] This often takes around a minute; or longer if the control plane images have to be pulled.
[apiclient] All control plane components are healthy after 39.511972 seconds
[uploadconfig] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace
[markmaster] Will mark node master as master by adding a label and a taint
[markmaster] Master master tainted and labelled with key/value: node-role.kubernetes.io/master=""
[bootstraptoken] Using token: <token>
[bootstraptoken] Configured RBAC rules to allow Node Bootstrap tokens to post CSRs in order for nodes to get long term certificate credentials
[bootstraptoken] Configured RBAC rules to allow the csrapprover controller automatically approve CSRs from a Node Bootstrap Token
[bootstraptoken] Creating the "cluster-info" ConfigMap in the "kube-public" namespace
[addons] Applied essential addon: kube-dns
[addons] Applied essential addon: kube-proxy

Your Kubernetes master has initialized successfully!

To start using your cluster, you need to run (as a regular user):

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  http://kubernetes.io/docs/admin/addons/

You can now join any number of machines by running the following on each node
as root:

  kubeadm join --token <token> <master-ip>:<master-port> --discovery-token-ca-cert-hash sha256:<hash>
```

到这里，初始化已经完成，通过返回的最后几行信息可以看出还有些工作要做，上面最后一行的`kubeadm join --token`命令要记录下来，添加工作节点会用到。

**注意：初始化完成后，要将全局代理和docker代理都去掉，否则无法将工作节点加入到集群，或遇到一些网络问题。**

## 安装pod网络
因为初始化的时候指定了flannel pod network，所以这里我安装的是flannel
```shell
wget https://raw.githubusercontent.com/coreos/flannel/v0.9.0/Documentation/kube-flannel.yml
kubectl apply -f kube-flannel.yml
```

若安装失败，查看是否有多个网卡，如果有的话，需要在kube-flannel.yml中使用–iface参数指定集群主机内网卡的名称，否则可能会出现dns无法解析。修改-flannel.yml文件，给flanneld启动参数加上`–iface=<iface-name>`，如下：
```yaml
......
apiVersion: extensions/v1beta1
kind: DaemonSet
metadata:
  name: kube-flannel-ds
......
containers:
      - name: kube-flannel
        image: quay.io/coreos/flannel:v0.9.0-amd64
        command: [ "/opt/bin/flanneld", "--ip-masq", "--kube-subnet-mgr", "--iface=eth1" ]
......
```

然后重新执行：`kubectl apply -f kube-flannel.yml`

安装完成后，可以通过`kubectl get pods --all-namespaces`命令查看名为`kube-dns`的pod是否处于Running状态来确定flannel网络是否安装成功。若还是失败，请[查看troubleshooting-kubeadm](https://kubernetes.io/docs/setup/independent/troubleshooting-kubeadm/)或上GitHub查阅相关问题。

## 开始使用
pod网络配置好以后，需要配置常规用户访问k8s集群:
```shell
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

添加其他服务器作为工作节点，在其他服务器上执行初始化返回的命令，类似如下：
```shell
kubeadm join --token <token> <master-ip>:<master-port> --discovery-token-ca-cert-hash sha256:<hash>    
```
    
节点添加成功后，会看到类似下面的输出：
```shell
[kubeadm] WARNING: kubeadm is in beta, please do not use it for production clusters.
[preflight] Running pre-flight checks
[discovery] Trying to connect to API Server "10.138.0.4:6443"
[discovery] Created cluster-info discovery client, requesting info from "https://10.138.0.4:6443"
[discovery] Requesting info from "https://10.138.0.4:6443" again to validate TLS against the pinned public key
[discovery] Cluster info signature and contents are valid and TLS certificate validates against pinned roots, will use API Server "10.138.0.4:6443"
[discovery] Successfully established connection with API Server "10.138.0.4:6443"
[bootstrap] Detected server version: v1.8.0
[bootstrap] The server supports the Certificates API (certificates.k8s.io/v1beta1)
[csr] Created API client to obtain unique certificate for this node, generating keys and certificate signing request
[csr] Received signed certificate from the API server, generating KubeConfig...

Node join complete:
* Certificate signing request sent to master and response
  received.
* Kubelet informed of new secure connection details.

Run 'kubectl get nodes' on the master to see this machine join.
```

在主节点上查看所有节点状态：`kubectl get nodes`

默认情况下，集群不会将pod调度到主节点，若想要调度到主节点，执行以下命令：
```shell
kubectl taint nodes --all node-role.kubernetes.io/master-
```

会看到类似下面的输出：
```shell
node "test-01" untainted
taint key="dedicated" and effect="" not found.
taint key="dedicated" and effect="" not found.
```

默认情况下，工作节点上也不能使用`kubectl`执行查阅集群信息的相关命令。

至此，k8s集群就算搭建完成了。

## 部署dashboard
dashboard是k8s官方出的一个插件，为集群管理提供了UI界面，很有用，搭建也非常简单。

```shell
wget https://raw.githubusercontent.com/kubernetes/dashboard/master/src/deploy/recommended/kubernetes-dashboard.yaml
kubectl create -f kubernetes-dashboard.yaml
```

该插件依赖两个谷歌镜像：

gcr.io/google_containers/kubernetes-dashboard-init-amd64:v1.0.1
 
gcr.io/google_containers/kubernetes-dashboard-amd64:v1.7.1
 
这里我从其他的镜像仓库pull这两个镜像，然后将kubernetes-dashboard.yaml文件的image改为自己的镜像名。**注意：这里安装的dashboard是v1.7.1版本，v1.7.x需要以https的方式访问。**官方访问dashboard并不是通过NodePort暴露服务端口的形式，这里我修改了kubernetes-dashboard.yaml文件，使其以NodePort的形式暴露服务端口，在yaml文件最后一行加上`type: NodePort`，如下：
```yaml
······
spec:
  ports:
    - port: 443
      targetPort: 8443
  selector:
    k8s-app: kubernetes-dashboard
  type: NodePort
```

然后执行：`kubectl -n kube-system get service kubernetes-dashboard`，查看pod内443对外暴露的NodePort为30001：
```shell
NAME                   TYPE       CLUSTER-IP       EXTERNAL-IP   PORT(S)         AGE
kubernetes-dashboard   NodePort   10.100.111.222   <none>        443:30001/TCP   4h
```

浏览器访问https://<Node-IP>:<NodePort>，会看到登录界面，这里需要一个token来登录，也可以点击`SKIP`跳过登录直接进入dashboard，不过看不到任何集群相关的信息。

获取token：
```shell
[root@bazingafeng]# kubectl get secret -n kube-system|grep kubernetes-dashboard-token|awk '{print $1}'|xargs kubectl -n kube-system describe secret
Name:         kubernetes-dashboard-token-qsgvh
Namespace:    kube-system
Labels:       <none>
Annotations:  kubernetes.io/service-account.name=kubernetes-dashboard
              kubernetes.io/service-account.uid=5cbf9d64-d139-11e7-ba2f-001517872222

Type:  kubernetes.io/service-account-token

Data
====
ca.crt:     1025 bytes
namespace:  11 bytes
token:      eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJrdWJlLXN5c3RlbSIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VjcmV0Lm5hbWUiOiJrdWJlcm5ldGVzLWRhc2hib2FyZC10b2tlbi1xc2d2aCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VydmljZS1hY2NvdW50Lm5hbWUiOiJrdWJlcm5ldGVzLWRhc2hib2FyZCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VydmljZS1hY2NvdW50LnVpZCI6IjVjYmY5ZDY0LWQxMzktMTFlNy1iYTJmLTAwMTUxNzg3MjUzMCIsInN1YiI6InN5c3RlbTpzZXJ2aWNlYWNjb3VudDprdWJlLXN5c3RlbTprdWJlcm5ldGVzLWRhc2hib2FyZCJ9.blwE2XEtrTKJSdn1zUnKTdO9gr23fub6MRhmAECfekHucuWxT2DdmHA5Jr6MnNXSY9YCxU0ynTjVSiN0AMT-aOKoFuN7ndzJ-r3hO426FTu812m9cxVB39QqP35pJ0M8RhxBfNOywtgA0mY7KK8z7UbWwE3_kDMWKgzr9nL-CIKm9swbvXq0CEjVzbEnBONoE8q3nB7WT_WmgnMy29ceZoDXc8Z45cpJM6-cV0Wl7RpsaCMNiL22WTEjkwI34KvBDXawWvTr1uwcJElPU85Z12MTZMbA1ohTBECqR8gUOrVsTY3HV1Tq8rJmfOO52PwnoQvoxT1KCFHdx6-y87JWEg
```

用token登录，会发现看不到任何集群相关的信息，这是因为dashboard是基于RBAC来控制访问权限的，而默认的ServiceAccount只有很小的权限，因此这里要创建一个kubernetes-dashboard-admin的ServiceAccount并绑定admin的权限，创建kubernetes-dashboard-admin.rbac.yaml文件：
```yaml
---
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    k8s-app: kubernetes-dashboard
  name: kubernetes-dashboard-admin
  namespace: kube-system
  
---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: kubernetes-dashboard-admin
  labels:
    k8s-app: kubernetes-dashboard
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: kubernetes-dashboard-admin
  namespace: kube-system
```

执行 `kubectl create -f kubernetes-dashboard-admin.rbac.yaml`

查看kubernete-dashboard-admin的token:
```shell
kubectl get secret -n kube-system|grep kubernetes-dashboard-admin-token|awk '{print $1}'|xargs kubectl -n kube-system describe secret
```

再用这个token登录dashboard，就可以看到集群的全部信息了。

## 总结
总的来说，使用kubeadm安装k8s集群还是很方便的，省了很多事，我在安装过程中，主要的问题还是墙内安装时遇到的网络问题，后来上了代理之后，整个安装过程就顺畅多了。另外，官方还提供了一些插件，比如日志管理、监控等，很好用，部署也很简单，这里就暂不赘述了，后面有时间再整理。

参考：[https://www.kubernetes.org.cn/2906.html](https://www.kubernetes.org.cn/2906.html)
