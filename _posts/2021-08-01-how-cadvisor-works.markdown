---
layout:     post
title:      "cAdvisor源码阅读"
keywords:   "cadvisor, cadvisor源码, cadvisor原理" 
description: "cadvisor源码阅读，了解cadvisor详细过程"
date:       2021-08-01
published:  true 
catalog: true
tags:
    - go
    - cadvisor
---

基于 v0.39.0 版本。cadvisor是通过cgroup获取各个容器的指标的，支持docker、containerd、cri-o等多种容器运行时。

main 入口函数：
``` go
func main() {
	...
    // 初始化存储，指标默认存储在内存中，默认仅保留2分钟以内的数据
    // 也支持持久化，通过storage_driver参数可以指定持久化的存储
    // 目前支持的存储有bigquery、elasticsearch、influxdb、kafka、redis、statsd、stdout
	memoryStorage, err := NewMemoryStorage()
	if err != nil {
		klog.Fatalf("Failed to initialize storage driver: %s", err)
	}

  	// 定义了一些获取主机文件系统信息的方法
	sysFs := sysfs.NewRealSysFs()

  	// 创建采集指标的http client
	collectorHttpClient := createCollectorHttpClient(*collectorCert, *collectorKey)

  	// 初始化资源管理器
	resourceManager, err := manager.New(memoryStorage, sysFs, housekeepingConfig, includedMetrics, &collectorHttpClient, strings.Split(*rawCgroupPrefixWhiteList, ","), *perfEvents)
	if err != nil {
		klog.Fatalf("Failed to create a manager: %s", err)
	}

	...
	// 这个函数会默认把容器label和env加到metrics的label里去，如果label和env很多，可能会导致程序占用很多内存，这时可以设置store_container_labels参数为false，同时设置whitelisted_container_labels仅保留需要的label
	containerLabelFunc := metrics.DefaultContainerLabels
	if !*storeContainerLabels {
		whitelistedLabels := strings.Split(*whitelistedContainerLabels, ",")
		containerLabelFunc = metrics.BaseContainerLabels(whitelistedLabels)
	}

	// 注册Prometheus的handle
	cadvisorhttp.RegisterPrometheusHandler(mux, resourceManager, *prometheusEndpoint, containerLabelFunc, includedMetrics)

	// 启动资源管理器
	if err := resourceManager.Start(); err != nil {
		klog.Fatalf("Failed to start manager: %v", err)
	}

  	...
}
```
main函数的主要逻辑是主机、文件系统、handle等的初始化，然后用这些数据去创建一个资源管理器，最后去启动这个资源管理器。

资源管理器的初始化代码就不贴了，这里直接看下资源管理器的定义：
``` go
type manager struct {
  	// 存储所有容器
	containers               map[namespacedContainerName]*containerData
	containersLock           sync.RWMutex
  	// 指标数据存储
	memoryCache              *memory.InMemoryCache
  	// 文件系统信息
	fsInfo                   fs.FsInfo
  	// 主机系统信息
	sysFs                    sysfs.SysFs
	machineMu                sync.RWMutex // protects machineInfo
  	// 主机信息
	machineInfo              info.MachineInfo
	quitChannels             []chan error
	cadvisorContainer        string
    // 是否直接运行在宿主机上，运行在容器内为false
	inHostNamespace          bool
    // 事件处理器
	eventHandler             events.EventManager
  	// 启动时间
	startupTime              time.Time
  	// 指标采集的最大时间间隔
	maxHousekeepingInterval  time.Duration
	allowDynamicHousekeeping bool
    // 允许的指标
	includedMetrics          container.MetricSet
  	// 容器监听器，支持监听多种容器运行时
	containerWatchers        []watcher.ContainerWatcher
  	// 容器事件channel，每watch到一个容器事件就往eventsChannel里写入一条数据
	eventsChannel            chan watcher.ContainerEvent
	collectorHTTPClient      *http.Client
	nvidiaManager            stats.Manager
	perfManager              stats.Manager
	resctrlManager           stats.Manager
	// List of raw container cgroup path prefix whitelist.
	rawContainerCgroupPathPrefixWhiteList []string
}
```

Start的主要逻辑是初始化不同的容器运行时，并注册监听器，然后监听容器的创建并做相应的处理：
``` go
func (m *manager) Start() error {
  	// 初始化容器运行时监听器，InitializePlugins里的plugins就是不同的容器运行时，如docker、containerd、cri-o等
	m.containerWatchers = container.InitializePlugins(m, m.fsInfo, m.includedMetrics)
	...
}
```

看看InitializePlugins是如何初始化容器运行时的：
``` go
func InitializePlugins(factory info.MachineInfoFactory, fsInfo fs.FsInfo, includedMetrics MetricSet) []watcher.ContainerWatcher {
	pluginsLock.Lock()
	defer pluginsLock.Unlock()

	containerWatchers := []watcher.ContainerWatcher{}
	for name, plugin := range plugins {
      	// 注册各个容器运行时的监听器
		watcher, err := plugin.Register(factory, fsInfo, includedMetrics)
		if err != nil {
			klog.V(5).Infof("Registration of the %s container factory failed: %v", name, err)
		}
      	// 若不为空，则将监听器保存到containerWatchers数组中
		if watcher != nil {
			containerWatchers = append(containerWatchers, watcher)
		}
	}
	return containerWatchers
}
```
按照我们的理解，返回的containerWatchers应该包含不同容器运行时的监听器，然而，通过查看各个容器运行时的Register方法，发现它们都没有实现ContainerWatcher这个interface：
``` go
func (p *plugin) Register(factory info.MachineInfoFactory, fsInfo fs.FsInfo, includedMetrics container.MetricSet) (watcher.ContainerWatcher, error) {
	err := Register(factory, fsInfo, includedMetrics)
  	// 返回的ContainerWatcher是nil
	return nil, err
}
```
也就是说，InitializePlugins并没有注册容器运行时的监听器，那么，不同容器运行时创建的容器到底是如何被监听到的呢？

接着往下看Start方法的代码：
``` go
func (m *manager) Start() error {
	m.containerWatchers = container.InitializePlugins(m, m.fsInfo, m.includedMetrics)

  	// 这个Register里注册了一个raw类型的工厂方法，当有raw类型的容器被监听到，会使用注册的factory进行处理
	err := raw.Register(m, m.fsInfo, m.includedMetrics, m.rawContainerCgroupPathPrefixWhiteList)
	if err != nil {
		klog.Errorf("Registration of the raw container factory failed: %v", err)
	}

    // 这里创建的是一个raw类型的容器监听器
  	rawWatcher, err := raw.NewRawContainerWatcher()
	if err != nil {
		return err
	}
  	// 将raw watcher也保存到m.containerWatchers数组中
	m.containerWatchers = append(m.containerWatchers, rawWatcher)
	...

	quitWatcher := make(chan error)
    // 看这儿，监听容器就在这个方法里
	err = m.watchForNewContainers(quitWatcher)
	if err != nil {
		return err
    }
}
``` 
可以看到注册了一个raw类型的watcher，这个rawWatcher实现了watch.ContainerWatcher接口，它才是真正的容器监听器，也就是说不同容器运行时创建的容器都是通过这个监听器监听到的，那它是如何做到的呢？

直接看m.watchForNewContainers()方法的代码：
``` go
func (m *manager) watchForNewContainers(quit chan error) error {
	watched := make([]watcher.ContainerWatcher, 0)
  	// 遍历所有containerWatcher，实际上只有raw类型的watcher
	for _, watcher := range m.containerWatchers {
      	// 就是这个Start方法了，启动监听器
		err := watcher.Start(m.eventsChannel)
		if err != nil {
			for _, w := range watched {
				stopErr := w.Stop()
				if stopErr != nil {
					klog.Warningf("Failed to stop wacher %v with error: %v", w, stopErr)
				}
			}
			return err
		}
		watched = append(watched, watcher)
	}
 	...
    go func() {
		for {
			select {
              // 接收容器事件
			case event := <-m.eventsChannel:
				switch {
				case event.EventType == watcher.ContainerAdd:
					switch event.WatchSource {
					default:
                        // 若为创建容器的事件，则调用createContainer，也就是收集该容器的各项指标保存在内存中，并定时更新
						err = m.createContainer(event.Name, event.WatchSource)
					}
				case event.EventType == watcher.ContainerDelete:
                    	// 若为删除容器的事件，则清理该容器的指标数据
					err = m.destroyContainer(event.Name)
				}
				if err != nil {
					klog.Warningf("Failed to process watch event %+v: %v", event, err)
				}
			case <-quit:
				var errs partialFailure

				// 若为退出事件，则停止所有的containerWatchers
				for i, watcher := range m.containerWatchers {
					err := watcher.Stop()
					if err != nil {
						errs.append(fmt.Sprintf("watcher %d", i), "Stop", err)
					}
				}

				if len(errs) > 0 {
					quit <- errs
				} else {
					quit <- nil
					klog.Infof("Exiting thread watching subcontainers")
					return
				}
			}
		}
	}()
	return nil
}
```
可以看到，它起了一个协程接收容器事件，容器事件来源于watcher.Start(m.eventsChannel)方法里，即真正的监听行为在这个Start里，看它的实现：
``` go
func (w *rawContainerWatcher) Start(events chan watcher.ContainerEvent) error {
	// Watch this container (all its cgroups) and all subdirectories.
	watched := make([]string, 0)
  	// 首先遍历cgroup子系统，如/sys/fs/cgroup/cpu、/sys/fs/cgroup/memory等等
	for _, cgroupPath := range w.cgroupPaths {
      	// watchDirectory是一个递归的方法，它会监听cgroup子系统其所有子目录
		_, err := w.watchDirectory(events, cgroupPath, "/")
		if err != nil {
			for _, watchedCgroupPath := range watched {
				_, removeErr := w.watcher.RemoveWatch("/", watchedCgroupPath)
				if removeErr != nil {
					klog.Warningf("Failed to remove inotify watch for %q with error: %v", watchedCgroupPath, removeErr)
				}
			}
			return err
		}
		watched = append(watched, cgroupPath)
	}

	// 起个协程处理内核事件
	go func() {
		for {
			select {
              // 这里的w.watcher就是之前初始化的内核事件watcher
			case event := <-w.watcher.Event():
            	// 接收到内核事件后，交给processEvent处理
				err := w.processEvent(event, events)
				if err != nil {
					klog.Warningf("Error while processing event (%+v): %v", event, err)
				}
			case err := <-w.watcher.Error():
				klog.Warningf("Error while watching %q: %v", "/", err)
			case <-w.stopWatcher:
				err := w.watcher.Close()
				if err == nil {
					w.stopWatcher <- err
					return
				}
			}
		}
	}()

	return nil
}
```
可以发现，这个rawContainerWatcher其实是监听的cgroup子系统下的所有子目录，因为每个容器都会有对应的cgroup子目录，所以当监听到有一个cgroup子目录被创建时，就可以认为有一个容器被创建了。而且这样做的好处是屏蔽了具体的容器运行时，不管是哪种容器运行时创建的容器都可以被监听到，真是妙啊！

监听目录又是怎么监听的呢？归根到底，是监听的内核事件，上述代码中的w.watch就是内核事件监听器：
``` go
func NewRawContainerWatcher() (watcher.ContainerWatcher, error) {
	...
	watcher, err := common.NewInotifyWatcher()
  	...
}

func NewInotifyWatcher() (*InotifyWatcher, error) {
	w, err := inotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return &InotifyWatcher{
		watcher:           w,
		containersWatched: make(map[string]map[string]bool),
	}, nil
}

  func NewWatcher() (*Watcher, error) {
	fd, errno := syscall.InotifyInit1(syscall.IN_CLOEXEC)
	if fd == -1 {
		return nil, os.NewSyscallError("inotify_init", errno)
	}
	w := &Watcher{
		fd:      fd,
		watches: make(map[string]*watch),
		paths:   make(map[int]string),
		Event:   make(chan *Event),
		Error:   make(chan error),
		done:    make(chan bool, 1),
	}
	// 这里起了一个协程去监听内核事件
	go w.readEvents()
	return w, nil
  }
```

接着看看接收到内核事件后，processEvent是如何处理的：
``` go
func (w *rawContainerWatcher) processEvent(event *inotify.Event, events chan watcher.ContainerEvent) error {
	// 将内核事件转换为容器事件
	var eventType watcher.ContainerEventType
	switch {
	case (event.Mask & inotify.InCreate) > 0:
		eventType = watcher.ContainerAdd
	case (event.Mask & inotify.InDelete) > 0:
		eventType = watcher.ContainerDelete
	case (event.Mask & inotify.InMovedFrom) > 0:
		eventType = watcher.ContainerDelete
	case (event.Mask & inotify.InMovedTo) > 0:
		eventType = watcher.ContainerAdd
	default:
		// Ignore other events.
		return nil
	}

	// Derive the container name from the path name.
	var containerName string
	for _, mount := range w.cgroupSubsystems.Mounts {
		mountLocation := path.Clean(mount.Mountpoint) + "/"
		if strings.HasPrefix(event.Name, mountLocation) {
			containerName = event.Name[len(mountLocation)-1:]
			break
		}
	}
	if containerName == "" {
		return fmt.Errorf("unable to detect container from watch event on directory %q", event.Name)
	}

	// Maintain the watch for the new or deleted container.
	switch eventType {
	case watcher.ContainerAdd:
		// 若为新增容器事件，表名有新的子目录被创建，则监听该目录及其子目录
		alreadyWatched, err := w.watchDirectory(events, event.Name, containerName)
		if err != nil {
			return err
		}

		// Only report container creation once.
		if alreadyWatched {
			return nil
		}
	case watcher.ContainerDelete:
		// 若为删除容器事件，则移除对该目录的监听
		lastWatched, err := w.watcher.RemoveWatch(containerName, event.Name)
		if err != nil {
			return err
		}

		// Only report container deletion once.
		if !lastWatched {
			return nil
		}
	default:
		return fmt.Errorf("unknown event type %v", eventType)
	}

	// 将容器事件写入到eventChannel
	events <- watcher.ContainerEvent{
		EventType:   eventType,
		Name:        containerName,
		WatchSource: watcher.Raw,
	}

	return nil
}
```
可以看到，processEvent就是将内核事件转换为了容器事件，并对新建或删除容器的cgroup目录进行监听或移除监听，最后把容器事件写入channel，这样watchForNewContainers()方法里的协程接收到容器事件后就可以对该容器进行相应的处理。

下面简单看看接收到容器事件后，做了什么操作：
``` go
func (m *manager) createContainerLocked(containerName string, watchSource watcher.ContainerWatchSource) error {
	...
    // 获取容器运行时handler
	handler, accept, err := container.NewContainerHandler(containerName, watchSource, m.inHostNamespace)
	if err != nil {
		return err
    }

  	...
    // 每个容器生成一个containerData对象，也就是一个容器管理器
  	cont, err := newContainerData(containerName, m.memoryCache, handler, logUsage, collectorManager, m.maxHousekeepingInterval, m.allowDynamicHousekeeping, clock.RealClock{})
	if err != nil {
		return err
    }
  	...
	// 运行这个容器管理器，会定期更新相关数据
	return cont.Start()
}

func (cd *containerData) Start() error {
  	// 这个housekeeping会定期去采集容器指标数据
	go cd.housekeeping()
	return nil
}
```

如何获取handler的，看NewContainerHandler的代码：
``` go
func NewContainerHandler(name string, watchType watcher.ContainerWatchSource, inHostNamespace bool) (ContainerHandler, bool, error) {
	factoriesLock.RLock()
	defer factoriesLock.RUnlock()

	// 这个factories就是之前plugin.Register()里注册的
	for _, factory := range factories[watchType] {
		canHandle, canAccept, err := factory.CanHandleAndAccept(name)
		if err != nil {
			klog.V(4).Infof("Error trying to work out if we can handle %s: %v", name, err)
		}
		if canHandle {
			if !canAccept {
				klog.V(3).Infof("Factory %q can handle container %q, but ignoring.", factory, name)
				return nil, false, nil
			}
			klog.V(3).Infof("Using factory %q for container %q", factory, name)
          	// 使用第一个可用的容器运行时handler进行处理
			handle, err := factory.NewContainerHandler(name, inHostNamespace)
			return handle, canAccept, err
		}
		klog.V(4).Infof("Factory %q was unable to handle container %q", factory, name)
	}

	return nil, false, fmt.Errorf("no known factory can handle creation of container")
}
```
不同的容器运行时handler有不同的实现，要看当前节点上运行了哪种容器运行时。

完。
