---
layout:     post
title:      "理解JWT"
keywords:   "jwt,原理,什么是jwt,理解jwt,关于jwt" 
description: "什么是jwt,jwt的原理"
date:       2018-07-29
published:  true 
catalog: true
tags:
    - go 
---

## 什么是JWT
官方解释如下：
> JWT全称JSON Web Token，是一种开放标准（RFC 7519），它定义了一种紧凑且独立的方式，可以在通信双方以JSON对象安全地传输信息。此信息可以通过数字签名进行验证和信任。JWT可以使用密钥（使用HMAC算法）或者使用RSA或ECDSA的公钥/私钥对进行签名。

通俗点讲，JWT就是一种认证规范、标准。

## JWT的组成
JWT就是一个token，其结构是一个字符串，由三部分组成，以点号 `.` 分隔，通常像这样：
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

三个部分分别为：
* Header（头部）
* Payload（载体）
* Signature（签名）

#### Header
Header原数据是一个JSON对象，有`alg`和`typ`两个字段，`alg`表示生成JWT使用的散列算法，如`HMAC SHA256`、`RSA`等，默认是`HMAC SHA256`（简称`HS256`）；`typ`表示JWT的类型，其值一般就是JWT。
```
{
  "alg": "HS256",
  "typ": "JWT"
}
```
然后将该JSON对象进行Base64URL编码成字符串。

#### Payload
Payload部分也是一个JSON对象，用来存放需要传递的数据，官方提供但非必需的字段有以下[七个](https://tools.ietf.org/html/rfc7519#section-4.1)：
* iss (Issuer)：签发人
* sub (Subject)：主题
* aud (Audience)：受众
* exp (Expiration Time)：过期时间
* nbf (Not Before)：生效时间
* iat (Issued At)：签发时间
* jti (JWT ID)：编号

可以发现官方声明的字段都只有三个字符，这是因为JWT意味着紧凑。

我们也可以定义一些自己的私有字段：
```
{
  "sub": "1234567890",
  "name": "John Doe",
  "admin": true
}
```
然后将该JSON对象进行Base64URL编码成字符串。

**注意：不要将敏感信息放在`Header`或`Payload`中，因为Base64URL编码后的字符串可以被解码，任何人都可以获取到其中包含的信息。**

#### Signature
要生成一个签名，我们必须先有以下三部分信息：
* Base64URL编码后的`Header`
* Base64URL编码后的`Payload`
* 密钥secret

然后将编码后的`Header`和编码后的`Payload`以 `.` 拼接成一个字符串，最后将这个字符串与密钥使用 `Header` 中定义的加密算法进行加密，生成的字符串就是签名，算法如下：
```
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  secret)
```

最后将`Header`、`Payload`、`Signature`三部分以 `.` 拼接，获得的字符串就是JWT，也就是通常所说的token。

**注意：上面Header和Payload使用的编码都是Base64URL，而不是Base64。因为JWT有时会以参数的形式放在URL中，如http://bazingafeng.com/?token=xxx ，而Base64编码后的字符串有三个字符`+`、`/`、`=`，这三个字符在URL中有特殊含义，可能会导致一些问题。而Base64URL编码后的字符串将这三个字符分别使用`-`、`_`、`空格`进行了替换，使得token可以作为URL的参数。**

## JWT工作原理
JWT是如何验证客户端传过来的token的？

服务端收到客户端传过来的token之后，会对token以 `.` 进行分隔，获得`Header`、`Payload`、`Signature`三部分，再解码`Header`获得其中的签名算法`alg`，然后使用`Header`、`Payload`和`secret`生成新的签名，最后比较新的签名和原始签名是否一致，若不一致则表示token无效。若用户篡改了token的`Payload`信息，则生成的新的签名和token中包含的原始签名肯定不一致，也就无法通过认证。

可以看到，认证过程最终比较的是签名，由于生成签名使用的算法是不可逆的，且用户不知道`secret`，所以无法篡改签名。但如果用户知道了服务端存储的`secret`，就可以任意更改token了，这就相当于用户自己给自己签名了，因此一定要注意不能泄露`secret`。

## JWT如何使用
用户登录成功后，服务端会返回一个token，用户可以将这个token存储在Cookie或localStorage。每当用户与服务端通信，访问需要授权的资源时，都要传递这个token，传递方式一般是以`Authorization`字段放在HTTP请求头中，并带上Bearer标注：
```
Authorization: Bearer <token> 
```

当然也可以直接在URL中以参数的形式传递。
```
http://bazingafeng.com/?token=xxx
```

注意：不建议将token以Cookie的形式传递给服务端，因为这会存在跨域问题，也可能会有CSRF攻击的风险，而放在请求头中就不会有这样的问题。

## JWT vs. Session
#### Session
一般session认证过程：用户登录成功后，服务端会生成sessionID并存储，同时在客户端以cookie的形式存储，然后客户端每次请求都会带上这个cookie，服务端再去通过session做校验和认证。

这种方式使服务端必须把sessionID存储在内存或数据库中，可不管存在哪里都有缺点。若存储在内存中，对于分布式应用则需要多台服务器之间同步session；若存储在数据库中，则每次请求都要去查一次数据库。
* 优点
  * 可以主动清除session信息
* 缺点
  * 占用更多内存

#### JWT
相比session，JWT是无状态的，token存储在客户端，服务端只保存密钥secret，不存储任何session信息。那么，服务端是无法清除token让用户退出登录的，只能等待token过期。

* 优点
  * 服务端不用存储session信息，节省内存
  * 解决跨域问题，防CSRF攻击（token通过请求头传递）
* 缺点
  * 服务端无法主动清除token，只能等待token过期
  * 无法保证实效性，若token中存储了用户角色信息，而服务后台修改了该用户的角色，在该token过期之前，用户的角色不会变更。

**针对服务端无法主动清除token的问题，查阅了一些文章，解决办法是把token存到Redis或其他数据库，当需要时再去清除或更新token。个人觉得使用JWT，服务端不应该存储token，保证其无状态特性。如果服务端存储了token，那和session又有什么区别？**

## JWT使用场景
JWT适用于具有时效性的一次性授权token的设计。如：
* 邮箱验证。
* restful api的鉴权。用户一旦登录，其每个后续请求都要包含token，来访问需要授权的路由、服务和资源。

是否适用于会话管理？
> 网上有人认为不适合会话管理，认为使用传统的session + cookie方案更好。也有人认为可以做会话管理，认为不适合会话管理的问题都可以解决。就我个人观点来看，我倾向于不适合做会话管理，认为服务端不应该存储token。

## 使用JWT注意事项
* 不要在Payload中存储敏感信息
* 不要泄露secret
* 尽量使用HTTPS
因为token一旦被其他人获取，则他们可以冒充我们向服务器发起任意请求了。比如在HTTP请求中，我们发送token给服务端时，该token可能会被人抓包获取。针对这个问题，也没有什么解决办法，一般建议使用HTTPS而非HTTP。虽然这样不能保证token一定不会被人获取，但可以更加安全。

（完）
