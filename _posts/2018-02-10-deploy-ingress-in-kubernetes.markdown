---
layout:     post
title:      "Kubernetes部署Ingress"
keywords:   "ingress,ingress controller,deploy" 
description: "kubernetes部署ingress"
date:       2018-02-10
published:  true 
catalog: true
tags:
    - k8s 
    - docker 
---

## 前言
Kubernetes暴露服务的方式有多种，如LoadBalancer、NodePort、Ingress等。LoadBalancer一般用于云平台，平常一般用NodePort暴露服务，非常方便。但是由于NodePort需要指定宿主机端口，一旦服务多起来，多个端口就难以管理。那么，这种情况下，使用Ingress暴露服务更加合适。

## Ingress组成
Ingress一般包含三个组件：
* **反向代理负载均衡器**  
比如Nginx、Apache等。


* **Ingress Controller**  
目前官方最新版本的镜像ingress-controller:0.10.2已经集成了Nginx作为负载均衡，所以现在Ingress一般指Ingress Controller和Ingress资源两个组件。Ingress Controller负责实时监听Ingress资源，一旦Ingress发生更改，Controller会立即根据Nginx模板文件更新Nginx的配置，模板文件可以在[这里](https://github.com/kubernetes/ingress-nginx/blob/master/rootfs/etc/nginx/template/nginx.tmpl)找到，也可以根据自己的需求定制ingress-controller镜像。一个集群内可以部署多个Ingress Controller。


* **Ingress**  
通俗点讲，就是用来定义转发规则的，如下是一个很简单的ingress.yml配置：

```
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: test-ingress
spec:
  rules:
  - http:
      paths:
      - path: /testpath
        backend:
           serviceName: test
           servicePort: 80
```

若需要添加新的转发规则，只需修改上述文件，然后执行`kubectl apply -f ingress.yml`即可，或者执行`kubectl edit`直接编辑后保存，通过`kubectl logs`可以看到ingress-controller的Nginx配置是否更新成功。Ingress可以和Ingress Controller不在同一namespace，但必须与声明的服务在同一namespace。同样，一个集群内也可以部署多个Ingress，一个Controller可以匹配多个Ingress。

## 部署
部署一些必要的服务：
```
curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/namespace.yaml \
    | kubectl apply -f -

curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/default-backend.yaml \
    | kubectl apply -f -

curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/configmap.yaml \
    | kubectl apply -f -

curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/tcp-services-configmap.yaml \
    | kubectl apply -f -

curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/udp-services-configmap.yaml \
    | kubectl apply -f -
```
上面的default-backend.yml用于部署默认服务，当ingress找不到相应的请求时会返回默认服务，官方的默认服务返回404，也可以定制自己的默认服务。

基于RBAC部署Ingress Controller：
```
curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/rbac.yaml \
    | kubectl apply -f -

curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/with-rbac.yaml \
    | kubectl apply -f -
```

也可以基于非RBAC模式部署：
```
curl https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/without-rbac.yaml \
    | kubectl apply -f -
```

部署Ingress，假设集群内已经存在一个test服务，创建ingress.yml声明的规则如下：
```
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: ingress-nginx
spec:
  rules:
  - host: fengh0409.github.io
    http:
      paths:
      - backend:
           serviceName: test
           servicePort: 80
```

至此，ingress就部署完成了。配置hosts到Controller的PodIP，然后集群外访问fengh0409.github.io就可以访问test服务了。**注意：因为官方的Ingress Controller默认并没有开启`hostNetwork`模式，所以这里hosts配置的是Controller的PodIP。但是考虑到Pod重新调度后其IP会更改，那么hosts配置也要同时更改，所以一般建议开启`hostNetwork`模式，使Controller监听宿主机的端口，这样配置hosts时只需要配置Pod所在的节点IP即可。有人会说，如果Pod重新调度到其他节点了，hosts配置不是也要改变吗？不错，这种情况下，我们可以通过nodeSelector指定Ingress Controller调度到某个节点。这样hosts配置就不用变了。**修改如下：
```
...
nodeSelector:                   # 指定Ingress Controller调度到某个节点
  nodeName: myNodeName
hostNetwork: true               # 开启hostNetwork模式
containers:
  - name: nginx-ingress-controller
    image: quay.io/kubernetes-ingress-controller/nginx-ingress-controller:0.10.2
    args:
      - /nginx-ingress-controller
      - --default-backend-service=$(POD_NAMESPACE)/default-http-backend
      - --configmap=$(POD_NAMESPACE)/nginx-configuration
      - --tcp-services-configmap=$(POD_NAMESPACE)/tcp-services
      - --udp-services-configmap=$(POD_NAMESPACE)/udp-services
      - --annotations-prefix=nginx.ingress.kubernetes.io
...
```
建议将上述yaml文件下载到本地使用`kubectl create`部署，可以根据需求做相应更改。

## Ingress Controller匹配Ingress
当集群内创建多个Controller时，如何使某个Controller只监听对应的Ingress呢？这里就需要在Ingress中指定[annotations](https://github.com/kubernetes/ingress-nginx/blob/master/docs/user-guide/annotations.md)，如下：
```
metadata:
  name: nginx-ingress      
  namespace: ingress-nginx      
  annotations:
    kubernetes.io/ingress.class: "nginx"                  # 指定ingress.class为nginx
```
然后在Controller中指定参数`--ingress-class=nginx`：
```
args:
  - /nginx-ingress-controller
  - --default-backend-service=$(POD_NAMESPACE)/default-http-backend
  - --configmap=$(POD_NAMESPACE)/nginx-configuration
  - --tcp-services-configmap=$(POD_NAMESPACE)/tcp-services
  - --udp-services-configmap=$(POD_NAMESPACE)/udp-services
  - --annotations-prefix=nginx.ingress.kubernetes.io
  - --ingress-class=nginx                                 # 指定ingress-class值为nginx，与对应的Ingress匹配
```
这样，该Controller就只监听带有`kubernetes.io/ingress.class: "nginx"`annotations的Ingress了。我们可以声明多个带有相同annotations的Ingress，它们都会被对应Controller监听。Controller中的nginx默认监听80和443端口，若要更改可以通过`--http-port`和`--https-port`参数来指定，更多参数可以在[这里](https://github.com/kubernetes/ingress-nginx/blob/master/docs/user-guide/cli-arguments.md)找到。

在实际应用场景，常常会把多个服务部署在不同的namespace，来达到隔离服务的目的，比如A服务部署在namespace-A，B服务部署在namespace-B。这种情况下，就需要声明Ingress-A、Ingress-B两个Ingress分别用于暴露A服务和B服务，且Ingress-A必须处于namespace-A，Ingress-B必须处于namespace-B。否则Controller无法正确解析Ingress的规则。

## 总结
* 集群内可以声明多个Ingress和多个Ingress Controller
* 一个Ingress Controller可以监听多个Ingress
* Ingress和其定义的服务必须处于同一namespace

参考：  
[https://github.com/kubernetes/ingress-nginx/blob/master/README.md](https://github.com/kubernetes/ingress-nginx/blob/master/README.md)  
[https://mritd.me/2017/03/04/how-to-use-nginx-ingress/](https://mritd.me/2017/03/04/how-to-use-nginx-ingress/)  
[https://kubernetes.io/docs/concepts/services-networking/ingress/](https://kubernetes.io/docs/concepts/services-networking/ingress/)  

（完）

