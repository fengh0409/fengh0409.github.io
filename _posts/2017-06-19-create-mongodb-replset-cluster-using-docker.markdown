---
layout:     post
title:      "Docker搭建Mongodb集群"
keywords:   "mongodb cluster,docker" 
description: "详细讲述docker搭建mongodb副本集集群"
date:       2017-06-19
published:  true 
catalog: true
tags:
    - docker 
---

最近在搞公司内网开发环境，需要基于docker容器搭建一套mongodb复制集群，这我以前没搭过啊，于是我去Google了一下，发现还挺简单，但其中也遇到了坑，所以这里记录一下，避免以后再次踩坑。

## 思路
这里搭建集群是在单台物理机上搭建的，大致思路基本都是这样：使用mongo基础镜像启3个docker容器，一个主服务器两个备份服务器，将容器内的27017端口映射到物理机上三个端口，然后进入容器内初始化副本集就完成了。

## 初步尝试
根据上面的思路，我们一步步来实现。

启动三个mongodb容器：
```bash
docker run -d --name rs1 -v /data/mongodb/rs1:/data/db -p 30001:27017 mongo:3.2 mongod --dbpath /data/db --replSet mongoreplset

docker run -d --name rs2 -v /data/mongodb/rs2:/data/db -p 30002:27017 mongo:3.2 mongod --dbpath /data/db --replSet mongoreplset

docker run -d --name rs3 -v /data/mongodb/rs3:/data/db -p 30003:27017 mongo:3.2 mongod --dbpath /data/db --replSet mongoreplset
```
这里我将数据库挂载出来了，以免容器挂掉后导致数据全部丢失，将容器内27017端口分别映射到物理机30001、30002、30003端口，容器启动后启动mongo服务并指定副本集名称为mongoreplset。

上面启动3个容器的方法比较繁琐不够灵活，所以这里我改用`docker-compose`命令来启动多个容器，编排docker-compose.yml文件如下：
```bash
version: '3'
services:
  rs1:
    image: mongo:3.2
    container_name: "rs1"
    ports:
      - "30001:27017"
    volumes:
      - /data/mongodb/rs1:/data/db
    command: mongod --dbpath /data/db --replSet mongoreplset
  rs2:
    image: mongo:3.2
    container_name: "rs2"
    ports:
      - "30002:27017"
    volumes:
      - /data/mongodb/rs2:/data/db
    command: mongod --dbpath /data/db --replSet mongoreplset
  rs3:
    image: mongo:3.2
    container_name: "rs3"
    ports:
      - "30003:27017"
    volumes:
      - /data/mongodb/rs3:/data/db
    command: mongod --dbpath /data/db --replSet mongoreplset
```
在docker-compose.yml文件所在目录执行`docker-compose up -d`，这样就启动了三个容器，通过`docker ps`查看容器是否启动成功，如果启动失败，可以通过命令`docker logs 容器id`查看日志信息。

容器启动成功后，集群就基本搭建完成了，但此时副本集还未初始化，进入容器rs1初始化副本集:
```
docker exec -ti rs1 mongo

rs.initiate()
rs.add('rs2:27017')
rs.add('rs3:27017')
rs.status()  
```
通过`rs.status()`可以看到rs1是主服务器，rs2和rs3是备份服务器，现在来验证一下，在rs1容器写入一条数据，然后进入rs2和rs3查看数据是否同步：
```
docker exec -ti rs1 mongo
use test
db.test.insert({now: new Date()})
quit()

docker exec -ti rs2 mongo
rs.slaveOk()    // 备份节点默认不可读写，需要通过该命令来允许读操作
use test
db.test.find()
quit()

docker exec -ti rs3 mongo
rs.slaveOk()
use test
db.test.find()
quit()
```
通过运行结果可以看到数据已经同步，说明我们的副本集搭建成功了。哟嚯~~~

## 出现问题
我们内网环境搭了一个swarm集群，我在该集群另一台物理机上启动了一个搭好了php-fpm-nginx环境的web容器，当我在web中通过PHP客户端连接到mongo集群时，问题就来了，我发现居然连不上mongo集群！(我们的web容器与mongo集群是处于同一网络模式的，所以不存在网络不通的情况。)测试代码如下：
```php
<?php
try {
    $options = array('replicaSet'=>'mongoreplset');
    $mongo = new MongoClient('mongodb://rs1:30001,rs2:30002,rs3:30003', $options);
    var_dump($mongo);
} catch (Exception $e) {
    echo $e->getMessage();
}
```
运行后没有打印出结果，而是在等待数秒后捕获到了异常，说明连接到mongo集群失败，然后我使用非集群模式连接到mongo集群的单台服务器，可以正常打印结果，说明mongo服务是可用的。
```php
<?php
try {
    $mongo = new MongoClient('mongodb://rs1:30001');
    var_dump($mongo);
} catch (Exception $e) {
    echo $e->getMessage();
}
```

这就很尴尬了，单台服务器可以连上，集群模式却连不上，在网上Google了一大圈也没啥收获，后来去请教我们老大，他说他之前搭redis集群也遇到过这样的问题，因为启动的容器如果不指定网络的话，默认使用`bridge`网络，但使用bridge网络连接到集群是有问题的，具体是什么问题我们也不确定。

## 解决方案
**老大给出的解决方案是采用host网络，启动mongo容器时直接指定端口。**在host网络模式下，宿主机和容器之间没有被隔离，网络和端口都是共享的，在容器中指定的端口相当于直接在宿主机上指定了该端口。比如使用host网络启动一个mongo容器并指定27017端口，就相当于在宿主机上启了一个mongo服务并指定了27017端口，这里有一点要注意的是：我们要在其他的物理机上访问的话也就只能通过宿主机的`ip+端口`来访问了。

修改docker-compose.yml文件：
```bash
version: '3'
services:
  rs1:
    image: mongo:3.2
    container_name: "rs1"
    network_mode: "host"
    volumes:
      - /data/mongodb/rs1:/data/db
    command: mongod --port 27017 --dbpath /data/db --replSet mongoreplset
  rs2:
    image: mongo:3.2
    container_name: "rs2"
    network_mode: "host"
    volumes:
      - /data/mongodb/rs2:/data/db
    command: mongod --port 27018 --dbpath /data/db --replSet mongoreplset
  rs3:
    image: mongo:3.2
    container_name: "rs3"
    network_mode: "host"
    volumes:
      - /data/mongodb/rs3:/data/db
    command: mongod --port 27019 --dbpath /data/db --replSet mongoreplset
```

这里通过`network_mode`指令指定使用host网络，`command`指令分别指定了27017、27018、27019三个端口，然后通过`docker-compose up -d`重新启动。如果启动失败，请先`docker-compose stop`，再rm掉这几个容器，并清空挂载目录下的文件。

容器重新启动后初始化副本集集群，步骤和上面是一样的，但也有点区别：
```bash
docker exec -ti rs1 mongo --port 27017

rs.initiate()
rs.add('10.0.5.11:27018')
rs.add('10.0.5.11:27019')
rs.status()  
```
这里添加副本集成员必须使用宿主机ip而不能使用容器名，然后我们重新通过PHP客户端连接到mongo集群：
```php
<?php
try {
    $options = array('replicaSet'=>'mongoreplset');
    $mongo = new MongoClient('mongodb://10.0.5.11:27017,10.0.5.11:27018,10.0.5.11:27019', $options);
    var_dump($mongo);
} catch (Exception $e) {
    echo $e->getMessage();
}
```

运行以上代码，打印结果正常。至此，我们的mongo集群终于搭建成功并能通过集群的模式来连接了。

## 注意点
当需要向mongodb导入数据时，需要指定宿主机IP：
```bash
mongoimport -h 10.0.5.11 -d mydb -c mycol data.dat
```

为了让以上操作全部自动化，初始化副本集的操作可以写一个shell脚本，然后构建一个镜像，使用docker-compose启动，从而在mongo容器启动后，可以通过脚本自动初始化副本集，大大提高了开发效率。

（完）
