---
layout:     post
title:      "Nginx设置FastCGI Cache"
keywords:   "fastcgi cache,fastcgi,nginx" 
description: "如何使用nginx设置fastcgi cache"
date:       2017-06-27
published:  true 
catalog: true
tags:
    - php 
    - nginx
---

## 前言
Nginx包含一个FastCGI模块，该模块具有缓存PHP后端提供的动态内容的指令。设置此操作将无需额外的页面缓存解决方案，如反向代理或特定于应用程序的插件。也可以根据请求方法，URL，Cookie或任何其他服务器变量不缓存某些内容。

## 开启FastCGI Cache
编辑nginx.conf配置文件，在`Server{}`模块的上面添加以下内容：
```
fastcgi_cache_path /etc/nginx/cache levels=1:2 keys_zone=MYAPP:100m inactive=60m;
fastcgi_cache_key "$scheme$request_method$host$request_uri";
```

上面`fastcgi_cache_path`指令指定缓存的路径为`/etc/nginx/cache`，大小为100M，内存区域名称为`MYAPP`，缓存目录级别是子目录级别，非活动时间是`60m`。

`fastcgi_cache_path`的路径可以是硬盘的任何位置，但设置的缓存目录大小必须小于`RAM+Swap`的大小，否则会报`无法分配内存`的错误。`inactive`选项表示如果在指定的时间段（60分钟）中未访问缓存，则Nginx会将其删除。

`fastcgi_cache_key`指令指定缓存文件名将如何被散列，Nginx根据该指令对访问的文件进行md5加密。

下一步，在`location ~ .php$ {}`中添加以下内容：
```
fastcgi_cache MYAPP;
fastcgi_cache_valid 200 60m;
```

`fastcgi_cache`指令引用了我们在`fastcgi_cache_path`指令中指定的内存区域名称，并将缓存存储在此区域中。

默认情况下，Nginx会将缓存的对象存储在任何这些头指定的持续时间内：**X-Accel-Expires / Expires / Cache-Control**。`fastcgi_cache_valid`指令用于指定默认的缓存生命周期，如果这些头没有指定缓存时间。在上面的声明中，`200`表示仅缓存状态码为200的响应，当然也可以指定其他的状态码。

配置已全部完成，然后检测Nginx配置文件并重载：
```
/usr/local/nginx/sbin/nginx -t
/usr/local/nginx/sbin/nginx -s reload
```

完整的配置像下面这样：
```
fastcgi_cache_path /etc/nginx/cache levels=1:2 keys_zone=MYAPP:100m inactive=60m;
fastcgi_cache_key "$scheme$request_method$host$request_uri";

server {
    listen   80;

    root /usr/share/nginx/html;
    index index.php index.html index.htm;

    server_name example.com;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_pass unix:/var/run/php5-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_cache MYAPP;
        fastcgi_cache_valid 200 60m;
    }
}
```
