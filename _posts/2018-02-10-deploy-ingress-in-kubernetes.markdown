---
layout:     post
title:      "kubernetes部署ingress"
keywords:   "ingress,ingress controller,deploy" 
description: "kubernetes部署ingress"
date:       2018-02-10
published:  true 
catalog: true
tags:
    - k8s 
    - docker 
---

## Ingress组成
Ingress一般包含三个组件：
* **反向代理负载均衡器**  
比如Nginx、Apache等。


* **Ingress Controller**  
目前官方最新版本的镜像ingress-controller:0.10.2已经集成了Nginx作为负载均衡，所以现在Ingress一般指Ingress Controller和Ingress资源两个组件。Ingress Controller负责实时监听Ingress资源，一旦Ingress发生更改，Controller会立即根据Nginx模板文件更新Nginx的配置，模板文件可以在[这里](https://github.com/kubernetes/ingress-nginx/blob/master/rootfs/etc/nginx/template/nginx.tmpl)找到。有需要的话，也可以根据各自业务需求定制自己的ingress-controller镜像。


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

若需要添加新的转发规则，只需修改上述文件，然后执行`kubectl apply -f ingress.yml`即可，或者执行`kubectl edit`直接编辑后保存，通过`kubectl logs`可以看到ingress-controller的Nginx配置是否更新成功。

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
  - host: bazingafeng.com
    http:
      paths:
      - backend:
           serviceName: test
           servicePort: 80
```

至此，ingress就部署完成了。配置bazingafeng.com的hosts到Controller的PodIP，然后集群外访问bazingafeng.com就可以访问test服务了。**注意：因为官方的Ingress Controller默认并没有开启`hostNetwork`模式，所以这里hosts配置的是Controller的PodIP。但是考虑到Pod重新调度后其IP会更改，那么hosts配置也要同时更改，所以一般建议开启`hostNetwork`模式，使Controller监听宿主机的端口，这样配置hosts时只需要配置Pod所在的节点IP即可。有人会说，如果Pod重新调度到其他节点了，hosts配置不是也要改变吗？不错，这种情况下，我们可以通过nodeSelector指定Ingress Controller调度到某个节点。这样hosts配置就不用变了。**修改如下：

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

建议将上述yaml文件下载到本地使用`kubectl create`部署，可以根据集群需求做相应更改

## Demo
## 总结
## 参考

(完)
