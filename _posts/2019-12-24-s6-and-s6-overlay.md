---
layout:     post
title:      "容器进程管理之S6和S6-overlay"
keywords:   "s6,s6-overlay,docker进程管理" 
description: "s6和s6-overlay"
date:       2019-12-24
published:  true
catalog: true
tags:
    - docker 
    - s6 
    - s6-overlay 
---

## 什么是s6
[s6](https://skarnet.org/software/s6/overview.html) 是一个用于 UNIX 的小型的、安全的守护进程管理组件，其英文全称
skarnet.org's small and secure supervision software suite，因为首字母有6个s，所以被称为 s6。

#### s6包含的组件
s6 包含很多组件，其核心组件有四个，分别是：s6-svscan、s6-supervise、s6-svscanctl、s6-svc。理论上来说，只要有了这四个核心组件，就可以使用 s6 的功能了，其他的组件只是提供一些附加功能。

其中，s6-svscan 和 s6-supervise 是进程管理树的组件，他们是常驻的，而 s6-svscanctl 和 s6-svc 是用于控制 s6-svscan 和 s6-supervise的，他们不是常驻的。

* s6-supervise
    s6-supervise 用于监听和维护守护进程的状态，当守护进程挂掉以后，s6-supervise 会重启该进程，它是每个守护进程的直接父进程。

* s6-svscan
    s6-svscan 用于为每个需要启动的守护进程启动一个 s6-supervise 进程，并监听和维护 s6-supervise 进程的状态，是 s6-supervise 的直接父进程。

* s6-svc
     s6-svc 用于控制运行中的 s6-supervise 进程，如 `s6-svc -k /var/run/s6/services/nginx`表示杀掉 nginx 进程，`s6-svc -r /var/run/s6/services/nginx` 表示重启 nginx 进程。

* s6-svscanctl
    s6-svscanctl 是用于控制 s6-svscan 进程的命令行工具，类似 s6-svc 控制 s6-supervise。

#### s6是如何启动的
s6 是用于管理守护进程的，那这些守护进程是如何被启动的呢？

从上面几个组件可以看出，守护进程是由 s6-supervise 启动的，而 s6-supervise 又是由 s6-svscan 启动的，因此，只需要启动 s6-svscan 就行了。

s6-svscan 启动时需要指定一个目录，如 `s6-svscan -t0 /var/run/s6/services`（若不指定则为当前目录），这个目录用于存放一些子目录，每个子目录表示需要启动的守护进程，子目录的目录名一般为进程名，如下表示需要启动 cron、nginx、ssh三个进程。
```
[root@0491df61dd4a services]# pwd
/var/run/s6/services
[root@0491df61dd4a services]# ls
cron  nginx  ssh
```

各个子目录中包含 run 和 finish 两个脚本文件，run 脚本文件用于启动守护进程，进程必须是前台常驻的，finish 脚本用于进程退出后执行一些清理操作。如下用于启动 nginx 进程的 run 脚本文件：
```
[root@0491df61dd4a nginx]# cat run
#!/usr/bin/with-contenv sh
exec /usr/local/nginx/sbin/nginx -g 'daemon off;
```

s6-svscan 会进入到指定的目录，并扫描该目录下的所有子目录。对于每一个子目录，都会创建一个对应的 s6-supervise 进程，再由 s6-supervise 创建对应的守护进程。

通过 ps -ef 可以看到进程树如下所示：
```
UID        PID  PPID  C STIME TTY          TIME CMD
root         1     0  0 11:23 ?        00:00:00 s6-svscan -t0 /var/run/s6/services
root        25     1  0 11:23 ?        00:00:00 s6-supervise s6-fdholderd
root       155     1  0 11:23 ?        00:00:00 s6-supervise cron
root       156     1  0 11:23 ?        00:00:00 s6-supervise ssh
root       158     1  0 11:23 ?        00:00:00 s6-supervise nginx
root       159   155  0 11:23 ?        00:00:03 /usr/sbin/crond -n
root       160   156  0 11:23 ?        00:00:03 /usr/sbin/sshd -D
root       162   158  0 11:23 ?        00:00:04 nginx: master process /usr/local/nginx/sbin/nginx -g daemon off;
daemon     166   162  0 11:23 ?        00:00:00 nginx: worker process
daemon     167   162  0 11:23 ?        00:00:00 nginx: worker process
daemon     168   162  0 11:23 ?        00:00:00 nginx: worker process
daemon     169   162  0 11:23 ?        00:00:00 nginx: worker process
```

通过 pstree 命令查看树形图：
```
s6-svscan─┬─s6-supervise
                  ├─s6-supervise───crond
                  ├─s6-supervise───sshd
                  └─s6-supervise───nginx───4*[nginx]
```

## 什么是s6-overlay
[s6-overlay](
https://github.com/just-containers/s6-overlay) 是基于 s6 的用于容器内多进程管理的工具。其实就是对 s6 做了一下封装，通常使用是在构建镜像时将 s6 的压缩包 s6-overlay.tag.gz 解压到镜像中，并指定镜像的启动命令为其 init 脚本。

```
FROM busybox
ADD https://github.com/just-containers/s6-overlay/releases/download/v1.21.8.0/s6-overlay-amd64.tar.gz /tmp/
RUN gunzip -c /tmp/s6-overlay-amd64.tar.gz | tar -xf - -C /
ENTRYPOINT ["/init"]
```

## s6-overlay的执行过程
s6-overlay的执行过程分为 3 个阶段：
1. 预处理阶段
用于准备一些环境变量，并检查一些文件的权限。

2. 启动阶段
启动阶段又可以分为三个阶段，分别是：
    * 执行修改相关权限的脚本，脚本位于 /etc/fix-attrs.d 目录。
    * 执行初始化脚本，用于处理一些初始化的操作，脚本位于 /etc/cont-init.d目录。
    * 拷贝用户的 /etc/services.d 目录中的文件到 s6 启动时指定的目录中，该 /etc/services.d 目录中存放的内容就是用于启动守护进程的子目录。

3. 结束阶段
容器退出时， 会先执行 /etc/cont-finish.d 目录中的脚本文件，用于清理相关内容，最后停止容器中的服务。

查看容器启动日志：
```
[s6-init] making user provided files available at /var/run/s6/etc...exited 0.
[s6-init] ensuring user provided files have correct perms...exited 0.
[fix-attrs.d] applying ownership & permissions fixes...
[fix-attrs.d] done.
[cont-init.d] executing container initialization scripts...
[cont-init.d] done.
[services.d] starting services
[services.d] done.
```

s6-init 即为预处理阶段，后面的 fix-attrs.d、cont-init.d、services.d 即为启动阶段。

查看停掉容器时的日志：
```
[cont-finish.d] executing container finish scripts...
[cont-finish.d] done.
[s6-finish] waiting for services.
[s6-finish] syncing disks.
[s6-finish] sending all processes the TERM signal.
[s6-finish] sending all processes the KILL signal and exiting.
```
以上即为结束阶段。

## 启动脚本init
s6-overlay的启动命令就是一个 init 脚本，通过查看该脚本内容，发现它调用了以下命令：
```
[root@test /]# cat /init
#!/usr/bin/execlineb -S0
/etc/s6/init/init-stage1 $@
```

其中，`/etc/s6/init/init-stage1` 后面有个 `$@`  参数，说明我们也可以在 init 后面指定要启动的服务，比如：
```
...
ENTRYPOINT ["/init"]
CMD ["nginx"]
```
表示仅启动 nginx 服务。

继续查看 /etc/s6/init/init-stage1 文件内容，发现最后一行也是调用了另一个脚本文件：
```
[root@test /]# cat /etc/s6/init/init-stage1
...
/etc/s6/init-no-catchall/init-stage1 $@
```

继续查看 /etc/s6/init-no-catchall/init-stage1 内容：
```
...
s6-svscan -t0 /var/run/s6/services
```

发现最终调用了 `s6-svscan -t0 /var/run/s6/services`，进入容器查看ps -ef，可以看到这个 `s6-svscan -t0 /var/run/s6/services` 也是 1 号进程。所以，到这里也就可以看出 s6-overlay 实际上就是调用了 s6 的功能，是使用 s6-svscan 来管理进程的。
