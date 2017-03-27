---
layout:     post
title:      "AngularJS之Providers"
keywords:   "angularjs供应商,provider,factory,service,constant,value," 
description: "angularjs中的providers详解、区别"
date:       2017-03-26
published:  false 
catalog: true
tags:
    - javascript 
    - angularjs 
    - providers 
---

最近因为工作需要接触到了AngularJS，在看到Providers的时候很迷惑，对factory、service和provider不太理解，也不知道什么时候该用哪一个来创建服务，后面通过阅读文档和查阅大量资料才弄清楚，所以在这里记录一下他们的用法和区别。

## 用法
AngularJS内置了很多服务，如$scope、$http、$location、$q等，我们可以通过依赖注入的方式来使用各个服务，其实这些服务可以看做是angular封装好的一些函数，在任何地方都可以方便地调用。如下面的例子：

```javascript
var app = angular.module('myApp', [])
app.controller('myController', ['$scope', '$http', function($scope, $http) {
    var url = 'http://localhost';
    $scope.title   = 'my title';
    $scope.content = $http.get(url);
}])
```

当然，在开发过程中，我们也往往有一些代码需要封装，以达到重用的目的，这个时候就需要我们自定义一些服务了。angularjs的Providers提供了constant、value、factory、service和provider五种方法来让我们创建自己的服务，下面我们来看看这五种方法有什么区别以及什么时候该使用哪种方法来创建服务。

## 区别
其实严格来讲，提供服务的方法只有一个，那就是provider，其余四个只是它的语法糖而已（官方文档有明确说明）。所以provider也是最全面的一个方法，其他四种自定义服务的方式，都可以用provider来实现。那么，既然provider可以实现，为什么还要这四个方法呢？

#### value
这个方法用于定义一些仅包含简单字符串的服务，比如下面定义一个MYHOST服务，他的值是一个主机地址：

```javascript
var app = angular.module('myApp', [])
app.value('MYHOST', 'http://localhost/')
```

然后在controller中你可以这样来使用MYHOST服务：

```javascript
app.controller('myController', ['$scope', 'MYHOST', function($scope, MYHOST) {
    $scope.host = MYHOST
}])
```

```html
<html ng-app="myApp">
  <body>
    <div ng-controller="myController">
      你的主机地址：{{host}}
    </div>
  </body>
</html>
```

当然，你也可以在定义其他服务时使用MYHOST，如下面的例子：
```javascript
app.factory('myFactory', ['$scope', 'MYHOST', function($scope, MYHOST) {
    var service = {};
    service.host = MYHOST;
    service.content = function() {
        // do something
    };

    return service;
}])
```
**注意：value方法创建的服务的值在程序中可以被重新赋值，但该服务不能在配置和程序运行阶段使用。**

#### angular生命周期
这里先解释下angular的生命周期。

angular程序的生命周期可以为两部分：配置阶段和运行阶段。配置阶段就是angular程序创建服务前的一些初始化和实例化的操作，这时，controller所引用的各个服务是不可用的，因为他们还没有被创建。配置阶段一旦完成，angular程序就开始创建服务，也就是开始运行阶段。


#### constant
该方法也是用于定义仅包含简单字符串的服务的，如下面的例子:

```javascript
var app = angular.module('myApp', [])
app.constant('MYHOST', 'http://localhost/')
```

然后在controller中使用该服务
```javascript
app.controller('myController', ['$scope', 'MYHOST', function($scope, MYHOST) {
    $scope.host = MYHOST
}])

```

```html
<html ng-app="myApp">
  <body>
    <div ng-controller="myController">
      你的主机地址：{{host}}
    </div>
  </body>
</html>
```

看到这里，你是不是觉得他和value是一样的？没错，用法确实是一样的，但还是有区别的。

constant与value有以下两点区别：
* constant定义的服务在程序中是不能改变的（通过其方法名`constant`就可以看出），而value可以。
* constant定义的服务可以在配置阶段使用，而value不可以。

看下面的例子，如果你想要在config中使用MYHOST服务，那么你不能使用value来定义该服务，而应该用constant。

```javascript
var app = angular.module('myApp', [])
app.constant('MYHOST', 'http://localhost/')
```

```javascript
app.config('MYHOST', ['$scope', 'MYHOST', function($scope, MYHOST) {
    $scope.host = MYHOST
}])
```

> 虽然value和constant使用起来非常简单，但他们也只能用于定义一些简单特性的服务，如果要定义比较复杂的服务就需要用factory、service、provider等。

#### factory
对于value和constant定义的服务，同样可以用更高级的factory、service、provider方法来实现，非常简单，这里只介绍factory。

```javascript
app.factory('MYHOST', function() {
    return 'http://localhost';
})
```

很明显，使用value和constant来定义这个服务是更加适合的。

factory定义服务的过程往往是先定义一个空的对象，然后给这个对象添加一些你所需要的属性或方法，最后返回这个对象，下面我们创建一个功能多点、复杂点的myfactory服务。

```javascript
app.factory('myFactory', ['$http', 'MYHOST', function($http, MYHOST) {
    var service = {};
    service.prefix  = MYHOST;
    service.getData = function() {
        // getdata from remote by $http
    }

    return service;
}])
```

OK，我们创建了一个包含prefix属性和getData()方法的服务，服务名是myFactory，现在我们可以在其他地方通过注入的方式使用这个服务了。

```javascript
app.controller('myController', ['$scope', 'myFactory', function($scope, myFactory) {
    $scope.myPrefix = myFactory.prefix;
    $scope.myData   = myFactory.getData();
}])
```

#### service
可能大部分人容易混淆的是service和factory，不知道使用哪一个来创建服务。
service和factory的区别就在于service可以看做是一个类，而factory看做是个function，所以factory里面需要return出来，而service不用，service是直接通过this来赋值的。

```javascript
app.service('myService', ['$http', 'MYHOST', function($http, MYHOST) {
    this.prefix  = MYHOST;
    this.getData = function() {
        // getdata from remote by $http
    }
}])
```

在controller中调用service

```javascript
app.controller('myController', ['$scope', 'myService', function($scope, myService) {
    $scope.myPrefix = myService.prefix;
    $scope.myData   = myService.getData();
}])
```

上面的例子，我们在定义myService的时候并没有return一个对象，且在controller注入该服务后可以直接通过`.`来调用其中的属性和方法，这是为什么呢？是因为angular会自动通过`new`关键词来创建对象。

#### provider
这个方法就厉害了，他是这五个创建服务的方法中最全面最核心的，其他四个仅仅是他的语法糖，他与factory和service最重要的区别在于他可以在配置阶段改变该服务中的值，每个provider必须要有一个`$get`方法。

angular提供了一个config方法，可以在配置阶段改变某些服务的值，下面我们通过一个例子来看看如何在配置阶段改变provider中定义的服务的值。

app.provider('myProvider', function() {
    var myHost = 'http://localhost';
})

## 总结
对于大多数服务来说，是不需要使用provider的，用factory或service就已经足够了，那么什么时候该使用他呢？**只有在你想要在config阶段改变某个部分的值的时候才使用provider**
app.config(function($provider) {
    $provider.constant('movie', 'the something')
})

等同于
app.constant('movie', 'the something')

