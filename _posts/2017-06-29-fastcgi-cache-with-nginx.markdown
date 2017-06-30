---
layout:     post
title:      "Nginx设置FastCGI Cache"
keywords:   "fastcgi cache,fastcgi,nginx" 
description: "如何使用nginx设置fastcgi cache"
date:       2017-06-29
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

下一步，在`location ~ \.php$ {}`中添加以下内容：
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
        fastcgi_cache MYAPP;
        fastcgi_cache_valid 200 60m;
        include fastcgi_params;
    }
}
```

## 测试FastCGI Cache
创建一个打印当前时间的test.php文件：
```php
<?php
echo date('Y-m-d H:i:s');
```

通过curl访问，发现每次访问的结果一样：
```
[root@703dad187862 html]# curl http://localhost/test.php;echo
2017-06-28 07:12:48
[root@703dad187862 html]# curl http://localhost/test.php;echo
2017-06-28 07:12:48
[root@703dad187862 html]# curl http://localhost/test.php;echo
2017-06-28 07:12:48
```

由此说明，我们设置的FastCGI Cache生效了。然后进入缓存目录`/etc/nginx/cache`，可以看到缓存文件：
```
[root@703dad187862 ~]# cd /etc/nginx/cache/
[root@703dad187862 cache]# ll 2/47/5f1796857e2d0d86e589be12bbd49472
-rw------- 1 nobody nobody 399 Jun 28 07:12 2/47/5f1796857e2d0d86e589be12bbd49472
```

我们还可以让Nginx在响应中添加一个`X-Cache`头，表明缓存是否被丢失或命中。

在`server{}`块上面添加以下内容：
```
add_header X-Cache $upstream_cache_status;
```

重载nginx.conf配置文件，然后通过curl做一个详细的请求：
```
[root@703dad187862 cache]# curl -v localhost/test.php
* About to connect() to localhost port 80 (#0)
*   Trying ::1...
* Connection refused
*   Trying 127.0.0.1...
* Connected to localhost (127.0.0.1) port 80 (#0)
> GET /test.php HTTP/1.1
> User-Agent: curl/7.29.0
> Host: localhost
> Accept: */*
>
< HTTP/1.1 200 OK
< Server: nginx/1.11.5
< Date: Tue, 27 Jun 2017 23:29:47 GMT
< Content-Type: text/html; charset=UTF-8
< Transfer-Encoding: chunked
< Connection: keep-alive
< X-Powered-By: PHP/7.0.12
< X-Cache: HIT
<
* Connection #0 to host localhost left intact
```

可以看到`X-Cache:HIT`这一行，表明命中了缓存。

或者在浏览器访问http://localhost/test.php，F12查看响应内容：
![Alt text](/img/2017/06/response.png)

## 排除某些缓存
某些动态内容（如身份验证所需的页面）不应被缓存，这样的内容可以根据诸如`$request_uri`，`$request_method`和`$http_cookie`这样的服务器变量被排除在缓存之外。

下面是一个简单的配置示例，必须写在`server{}`块中。
```
#默认缓存所有内容
set $no_cache 0;

#不缓存POST请求
if ($request_method = POST)
{
    set $no_cache 1;
}

#如果URL包含query_string查询字符串，则不缓存
if ($query_string != "")
{
    set $no_cache 1;
}

#不缓存以下的URL内容
if ($request_uri ~* "/(administrator/|login.php)")
{
    set $no_cache 1;
}

#如果cookie名是PHPSESSID，则不缓存
if ($http_cookie = "PHPSESSID")
{
    set $no_cache 1;
}
```

要将`$no_cache`变量应用于相应的指令，请将以下内容放在`location 〜 \.php $ {}`块中：
```
fastcgi_cache_bypass $no_cache;
fastcgi_no_cache $no_cache;
```
`fasctcgi_cache_bypass`指令忽略与先前设置的条件相关的请求的现有缓存，如果满足指定的条件，`fastcgi_no_cache`指令不会缓存请求。

## 清除缓存
缓存的命名约定基于我们为`fastcgi_cache_key`指令设置的变量:
```
fastcgi_cache_key "$scheme$request_method$host$request_uri";
```

根据这些变量，当我们请求`http://localhost/test.php`时，上面指令的变量内容被替换后的实际内容如下：
```
fastcgi_cache_key "httpGETlocalhost/test.php";
```

通过MD5对字符串进行hash后的内容为：
```
5f1796857e2d0d86e589be12bbd49472
```

这就是生成的缓存的文件名，就像我们设置的子目录级别“levels=1:2”，因此，第一级目录名将是MD5值的最后一个字符，也就是`2`，第二级目录名将是MD5剩余字符的最后两个字符，也就是`47`，所以，该缓存的完整路径如下：
```
/etc/nginx/cache/2/47/5f1796857e2d0d86e589be12bbd49472
```

基于这种缓存命名格式，你可以使用任何语言写一个清除缓存的脚本。下面我写了一个PHP脚本通过POST请求来清除缓存：
```php
<?php
$cache_path = '/etc/nginx/cache/';
$url = parse_url($_POST['url']);
if(!$url)
{
    echo 'Invalid URL entered';
    die();
}
$scheme = $url['scheme'];
$host = $url['host'];
$requesturi = $url['path'];
$hash = md5($scheme.'GET'.$host.$requesturi);
var_dump(unlink($cache_path . substr($hash, -1) . '/' . substr($hash,-3,2) . '/' . $hash));
```

给该脚本发送POST请求，传递的数据是要被清除缓存的URL地址：
```
curl -d 'url=http://localhost/test.php' http://localhost/purge.php
```

脚本将根据缓存是否被清除而输出true或false，请确保此脚本不会被缓存，且有访问权限。


（完）
