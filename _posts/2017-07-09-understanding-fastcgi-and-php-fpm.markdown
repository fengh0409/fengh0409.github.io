---
layout:     post
title:      "理解FastCGI和PHP-FPM"
keywords:   "fastcgi,php-fpm,fpm,如何使用php-fpm" 
description: "讲述什么是PHP-FPM，如何正确使用PHP-FPM"
date:       2017-07-09
published:  true 
catalog: true
tags:
    - php 
---

## 前言
由于我一直对CGI、FastCGI、PHP-CGI、PHP-FPM这几个概念都比较模糊，所以最近花了点时间去详细了解了一下，并在此做个学习记录。

## CGI和FastCGI
CGI（Common Gateway Interface）全称是`通用网关接口`，是web服务器与应用程序之间数据交换的一种与语言无关的协议，它规定了要传递给web服务器的数据和格式，如URL、查询字符串、POST数据、header请求头等。

当我们在客户端使用PHP应用程序向web服务器发起一个请求时，web服务器会启动对应的CGI程序，这里是PHP的解析器：PHP-CGI，然后PHP-CGI会解析php.ini配置文件，初始化环境，然后处理请求，处理完后CGI程序就自动退出了，最后返回结果给客户端。注意：这里的CGI程序存在性能问题，因为每有一个请求过来，CGI都会有一个`启动、初始化、退出`的过程（CGI最为人诟病的fork-and-execute模式），这是很耗费时间的，在高并发的时候，我们应用程序的响应时间就变得很长，甚至会出现无法访问的情况。

在这种情况下，FastCGI就出现了，从根本上来说，FastCGI就是用来提高CGI程序的性能的。和CGI一样，FastCGI也是一种与语言无关的协议，那它是如何提高性能的呢？

首先，FastCGI启动时会启一个主进程，它只做一次解析配置文件、初始化执行环境的操作，然后再启动多个子进程等待web请求。当接收到请求后，FastCGI进程管理器会将其传递给子进程，也就是一个php-cgi程序，同时可以立即接受下一个请求，子进程处理完请求后会接着等待下一个请求，这样就避免了CGI的fork模式，性能自然就高了。

可以看到，FastCGI就像一个常驻的CGI程序，它是多进程的，性能自然比CGI要好，当然消耗的内存也更多。

## 什么是PHP-FPM
在修改php.ini后，需要重启php-cgi才能生效，但是php-cgi不能平滑重启，杀掉php-cgi进程后，应用程序就无法工作了。这种情况下，PHP-FPM就出现了。

PHP-FPM是PHP的FastCGI进程管理器，它负责管理一个进程池，来处理web请求。它可以做到修改php.ini后平滑重启php-cgi，其处理机制是新的子进程用新的配置，已经存在的子进程处理完手上的活就可以歇着了，从而达到平滑过度的效果。其功能可以到[官方文档](http://php.net/manual/zh/install.fpm.php)查看。

自PHP 5.3.3开始，PHP就已集成了PHP-FPM，在编译安装PHP时，使用--enable-fpm参数即可启用PHP-FPM了。

## 使PHP-FPM监听Unix socket
php-fpm的监听方式默认采用TCP/Ip socket机制，Nginx默认的php文件解析配置如下：
```nginx
location ~ \.php$ {
    root           html;
    fastcgi_pass   127.0.0.1:9000;
    fastcgi_index  index.php;
    fastcgi_param  SCRIPT_FILENAME    $document_root$fastcgi_script_name;
    include        fastcgi_params;
}
```

查看fpm配置文件，其默认监听在9000端口，修改该配置使其监听Unix socket：
```ini
;listen = 9000
listen = /var/run/php-fpm.socket
```

然后修改Nginx配置文件：
```nginx
#fastcgi_pass   127.0.0.1:9000;
fastcgi_pass   unix:/var/run/php-fpm.socket;
```

重启Nginx，以后PHP的请求会被Nginx传递到Unix socket去处理。

## Unix socket与Tcp/Ip socket
为什么要采用Unix socket机制呢？下面简单说说它和TCP/Ip socket的区别。

Unix socket和Tcp/Ip socket都是进程间的一种通信机制，Unix socket允许运行在同一台计算机上的的进程之间进行双向数据交换。而Tcp/Ip socket允许运行在不同计算机上的进程间通过网络通信，在某些情况下，也可以使用Tcp/Ip socket与运行在同一台计算机上的进程通信（通过使用回环接口）。

UNIX socket知道进程在同一个系统上执行，所以它们可以避免一些检查和操作（如路由），这使得Unix socket进程间的通信比Tcp/Ip socket更快更轻。因此，如果你让进程在同一个主机上通信，使用Unix socket更好。

## PHP-FPM的平滑操作
启动php-fpm：`/usr/local/php/sbin/php-fpm`

php 5.3.3 以后不再支持php-fpm的start、reload、stop等操作，请使用信号控制fpm的master进程：
* INT,TERM 立刻终止
* QUIT 平滑终止
* USR1 重新打开日志文件
* USR2 平滑重载所有worker进程并重新载入配置和二进制模块

重启php-fpm要先找到php-fpm的master进程pid，然后使用USR2信号kill掉：
```
[root@8504d5fef581 /]# ps -ef|grep php-fpm
root         1024     0  0 Jul04 ?        00:00:19 php-fpm: master process (/usr/local/php/etc/php-fpm.conf)
nobody       1025     1  0 Jul04 ?        00:00:00 php-fpm: pool www
nobody       1026     1  0 Jul04 ?        00:00:00 php-fpm: pool www
```
`kill -USR2 1024`，kill掉后，fpm进程会自动重启。

以上方案一般用于没有生成php-fpm.pid文件时使用，我们可以在php-fpm.conf配置文件中指定pid文件的存放位置：
```
pid = /var/run/php-fpm.pid
```
重启php-fpm，/var/run目录下便会生成php-fpm.pid文件了，以后就可以使用以下命令重启php-fpm：
```
cat /var/run/php-fpm.pid|xargs kill -USR2
```

（完）
