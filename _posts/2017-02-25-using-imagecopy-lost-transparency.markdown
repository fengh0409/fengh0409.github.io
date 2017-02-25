---
layout:     post
title:      "php使用imagecopy()添加水印丢失透明度的问题"
keywords:   "imagecopy,水印,transparent" 
description: "使用imagecopy给图片添加水印丢失透明度的解决方案"
date:       2017-02-25
published:  true 
catalog: true
tags:
    - php 
---

## 问题描述
最近在工作中遇到一个很奇怪的问题，在使用php GD库的`imagecopy()`给图片添加带有透明度的图片水印时，水印的透明度变得不透明了，而且在不同浏览器上查看加水印后的图片，显示效果也不一样。<br>
我不知道是不是GD库和php版本的问题，php => 5.6.3，GD => bundled (2.1.0 compatible)。

## 问题重现
我要给目标图片加上一个水印，根据以往的实现方法一般都是通过GD库的`imagecopymerge()`或`imagecopy()`函数来实现的，这两个函数的作用是一样的：拷贝并合并图像的一部分。

这里简单介绍一下它们的区别：`imagecopymerge()`比`imagecopy()`多了一个参数$pct，这个参数用来设置水印的透明度，取值是从0到100的整数，值越大透明度越高。当$pct=0，即不透明，实际上什么也没做；当$pct=100时，表示完全透明，此时该函数和`imagecopy()`完全一样。<br>

因为我的水印图背景是完全透明的，所以我使用的是`imagecopy()`，也建议大家在添加背景完全透明的水印时使用此函数而不是`imagecopymerge()`。

水印图（png格式）：
![Alt text](/img/2017/02/ths-logo.png)
目标图片（gif格式）：
![Alt text](/img/2017/02/destination.PNG)

以下是实现代码：

```php
<?php
$dstPath = '/path/destination.gif';
$srcPath = '/path/ths-logo.png';
$dst = imagecreatefromgif($dstPath);
$src = imagecreatefrompng($srcPath);
list($dstWidth, $dstHeight) = getimagesize($dstPath);
list($srcWidth, $srcHeight) = getimagesize($srcPath);
$dstX = $dstWidth - $srcWidth - 20;
$dstY = $dstHeight - $srcHeight - 70;
imagecopy($dst, $src, $dstX, $dstY, 0, 0, $srcWidth, $srcHeight);
imagepng($dst);
imagedestroy($dst);
imagedestroy($src);
header('Content-Type:image/png');
exit;
```

最终生成的带水印图在chrome、firefox、IE上显示效果分别如下：
![Alt text](/img/2017/02/chrome.PNG)
![Alt text](/img/2017/02/firefox.PNG)
![Alt text](/img/2017/02/IE.PNG)

可以看到，三种浏览器上显示的效果都不一样，原来有透明背景的水印变得不透明了，生成的图片没有达到预期。

将上述代码中`imagecopy()`换为`imagecopymerge()`，如下：
```php
imagecopymerge($dst, $src, $dstX, $dstY, 0, 0, $srcWidth, $srcHeight, 100);
```

生成的效果图在chrome、firefox、IE下：
![Alt text](/img/2017/02/chrome-3.PNG)
惨不忍睹，字都看不到了。

为什么原来是透明背景的水印会变得不透明呢？这个问题我也想不通。

## 解决方案
遇到问题总要解决啊，于是开始寻找解决方案，Google搜了一堆也没有遇到有和我一样问题的，都是使用`imagecopy()`代替`imagecopymerge()`就解决了，可我就是用的`imagecopy()`啊，wtf!

皇天不负有心人，在看文档的过程中，我发现了`imagecolortransparent()`这个函数，它的作用是将某个颜色定义为透明色，将某个颜色定义为透明色！将某个颜色定义为透明色！看到这里我突然想到，如果我先将水印图添加到一张同样大小的白色背景图上，然后再通过`imagecolortransparent()`将白色背景定义为透明色，再把这张图当做水印添加到目标图片上不就可以了吗？！想到这里我激动不已，马上开始实现看看是不是我要的效果，以下是实现过程：

```php
<?php
$dstPath = '/path/destination.gif';
$srcPath = '/path/ths-logo.png';
$dst = imagecreatefromgif($dstPath);
$src = imagecreatefrompng($srcPath);
list($dstWidth, $dstHeight) = getimagesize($dstPath);
list($srcWidth, $srcHeight) = getimagesize($srcPath);
$dstX = $dstWidth - $srcWidth - 20;
$dstY = $dstHeight - $srcHeight - 70;
// 创建一个同样大小的白色背景图像
$im = imagecreatetruecolor($srcWidth, $srcHeight);
$white = imagecolorallocate($im, 255, 255, 255);
imagefill($im, 0, 0, $white);
// 将白色定义为透明色
imagecolortransparent($im, $white);
// 将水印图添加到白色背景图上
imagecopy($im, $src, 0, 0, 0, 0, $srcWidth, $srcHeight);
// 将新的水印图添加到目标图片上
imagecopy($dst, $im, $dstX, $dstY, 0, 0, $srcWidth, $srcHeight);
imagepng($dst);
imagedestroy($im);
imagedestroy($dst);
imagedestroy($src);
header('Content-Type:image/png');
exit;
```

运行以上代码后，生成的图片在chrome、firefo、IE上显示效果都一样，如下：
![Alt text](/img/2017/02/IE.PNG)
生成的图片显示效果比原来好多了，但并没有达到我的预期，水印背景仍然是不透明的，白色背景挡住了目标图像。
wtf again!不应该啊，照上面的逻辑，水印图应该是透明背景才对啊，为什么是白色的？？我没想明白为什么，但我想到了`imagecopymerge()`，于是我尝试这将最后一步的`imagecopy()`换成`imagecopymerge()`，代码如下：

```php
imagecopymerge($dst, $im, $dstX, $dstY, 0, 0, $srcWidth, $srcHeight, 100);
```

换掉后再运行以上代码，哈哈，没想到居然成功了，生成的图片水印是透明的，实现了我想要的效果。如下图：
![Alt text](/img/2017/02/chrome-2.PNG)

## 总结
这个问题最终是解决了，但仍然有一点疑惑。对于`imagecopy()`和`imagecopymerge()`这两个函数，虽然官方文档是那样解释的，但实际使用起来，为什么结果会不一样呢？有哪位同仁知道的还请不吝赐教，感激不尽。
最后遇到问题还是要多看文档，说不定就打个激灵灵机一动问题就解决了呢。

（完）

