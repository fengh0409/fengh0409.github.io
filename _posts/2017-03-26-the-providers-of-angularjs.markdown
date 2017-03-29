---
layout:     post
title:      "AngularJS之Providers"
keywords:   "angularjs供应商,provider,factory,service,constant,value," 
description: "angularjs中的providers详解、区别"
date:       2017-03-26
published:  true 
catalog: true
tags:
    - javascript 
---

最近因为工作需要接触到了AngularJS，在看到Providers的时候很迷惑，对factory、service和 provider 不太理解，也不知道什么时候该用哪一个来创建服务，后面通过阅读文档和查阅大量资料才弄清楚，所以在这里记录一下他们的用法和区别。

## 用法
AngularJS内置了很多服务，如`$scope`、`$http`、`$location`、`$q`等，我们可以通过依赖注入的方式来使用各个服务，其实这些服务可以看做是 angular 封装好的一些函数，在任何地方都可以方便地调用。如下面的例子：

```javascript
var app = angular.module('myApp', [])
app.controller('myController', ['$scope', '$http', function($scope, $http) {
    var url = 'http://localhost';
    $scope.title   = 'my title';
    $scope.content = $http.get(url);
}])
```

当然，在开发过程中，我们也往往有一些代码需要封装，以达到重用的目的，这个时候就需要我们自定义一些服务了。

angularjs的Providers提供了`constant`、`value`、`factory`、`service`和`provider`五种方法来让我们创建自己的服务，下面我们来看看这五种方法有什么区别以及什么时候该使用哪种方法来创建服务。

## 区别

#### value
这个方法用于定义一些仅包含简单字符串的服务，比如下面定义一个名为MYHOST的服务，他的值是一个主机地址：

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
**注意： value 方法创建的服务的值在程序中可以被重新赋值，但该服务不能在配置和程序运行阶段使用。**

#### angular生命周期
这里先解释下angular的生命周期。

angular程序的生命周期可以为两部分：`配置阶段`和`运行阶段`。配置阶段就是angular程序创建服务前的一些初始化和实例化的操作，这时，controller所引用的各个服务是不可用的，因为他们还没有被创建。配置阶段一旦完成，angular程序就开始创建服务，也就是开始运行阶段。


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

看到这里，你是不是觉得他和 value 是一样的？没错，用法确实是一样的，但还是有区别的。

 constant 与 value 有以下两点区别：
*  constant 定义的服务在程序中是不能改变的（通过其方法名`constant`就可以看出），而 value 可以。
*  constant 定义的服务可以在配置阶段使用，而 value 不可以。

看下面的例子，如果你想要在config中使用MYHOST服务，那么你不能使用 value 来定义该服务，而应该用 constant 。

```javascript
var app = angular.module('myApp', [])
app.constant('MYHOST', 'http://localhost/')
```

```javascript
app.config('MYHOST', ['$scope', 'MYHOST', function($scope, MYHOST) {
    $scope.host = MYHOST
}])
```

> 虽然 value 和 constant 使用起来非常简单，但他们也只能用于定义一些简单特性的服务，如果要定义比较复杂的服务就需要用到factory、service、provider等。

#### factory
对于 value 和 constant 定义的服务，同样可以用更高级的factory、service、provider方法来实现，非常简单，这里只介绍 factory 。

```javascript
app.factory('MYHOST', function() {
    return 'http://localhost';
})
```

很明显，使用 value 和 constant 来定义这个服务更加适合。

 factory 定义服务的过程往往是先定义一个空的对象，然后给这个对象添加一些你所需要的属性或方法，最后返回这个对象，下面我们创建一个功能多点、复杂点的服务。

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

OK，我们创建了一个包含 prefix 属性和 getData() 方法的服务，服务名是myFactory，现在我们可以在其他地方通过注入的方式使用这个服务了。

```javascript
app.controller('myController', ['$scope', 'myFactory', function($scope, myFactory) {
    $scope.myPrefix = myFactory.prefix;
    $scope.myData   = myFactory.getData();
}])
```

#### service
可能大部分人容易混淆的是 service 和 factory ，不知道使用哪一个来创建服务更加合适。

 service 和 factory 的区别就在于 service 可以看做是一个类，而 factory 看做是个function，所以 factory 里面需要return出来，而 service 不用， service 是直接通过this来赋值的。

```javascript
app.service('myService', ['$http', 'MYHOST', function($http, MYHOST) {
    this.prefix  = MYHOST;
    this.getData = function() {
        // getdata from remote by $http
    }
}])
```

在controller中调用 service 

```javascript
app.controller('myController', ['$scope', 'myService', function($scope, myService) {
    $scope.myPrefix = myService.prefix;
    $scope.myData   = myService.getData();
}])
```

到这里你可能会感到奇怪，既然 service 是一个类，为什么调用的时候没有进行实例化呢？这是因为angular会自动通过`new`关键词调用构造函数来创建对象。

> 通过比较 factory 和 service ，我们可以看出两者其实并没有什么差别，只是一个通过函数式的方式实现，一个通过类的方式实现，具体使用哪一个不必太过深究，根据自己的编码习惯，喜欢使用哪个就使用哪个。

#### provider
这个方法是这几个创建服务的方法中最核心最全面的，事实上，其他四个仅仅是他的语法糖，每个 provider 必须要有一个`$get`方法。

该方法与 factory 和 service 最主要的区别在于他创建的服务可以在配置阶段重新赋值。

angular提供了一个叫config的方法，可以在配置阶段改变某些服务的值，下面我们通过一个例子来看看如何在配置阶段改变 provider 中定义的服务的值。

```javascript
app.provider('myProvider', function() {
    var myHost = 'http://localhost';
    this.modifyHost = function(host) {
        myHost = host;
    }
    this.$get = function() {
        var service = {};
        if (myHost == 'http://localhost') {
            service.title = 'your host is localhost, dont\'t you modify?';
        } else {
            service.title = 'your host is ' + myHost;
        }

        return service;
})
```

在配置阶段对myHost重新赋值

```javascript
app.config('myProviderProvider', function(myProviderProvider) {
    myProviderProvider.modifyHost('http://bazingafeng.com')
})
```

重新赋值后，我们在controller中使用myProvider服务
```javascript
app.controller('myController', ['$scope', 'myProvider', function($scope, myProvider) {
    $scope.myHost = myProvider
}])
```
将会得到结果`your host is http://bazingafeng.com`

可能大家注意到，config中注入myProvider时多加了一个 provider ，为什么呢？这是为了识别 provider 服务。

到这里，其实可以发现， provider 服务其实是通过`$get`来实现的。

## 总结
对于大多数服务来说，是不需要使用 provider 的，用 factory 或 service 就已经足够了，那么什么时候才用 provider 呢？**只有你想要在配置阶段动态修改某个服务的值的时候才使用。**

到这里，相信大家已经很清楚了，其实这几个创建服务的方法并没有实质上的区别，只要你乐意，你想怎么用就怎么用，想用哪个就用哪个，只是用哪个更加方便而已。

（完）

