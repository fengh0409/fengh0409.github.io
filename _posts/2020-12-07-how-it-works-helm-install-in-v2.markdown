---
layout:     post
title:      "Helm install源码阅读"
keywords:   "helm install, helm install源码, helm install原理" 
description: "helm install源码阅读，了解helm install详细过程"
date:       2020-12-07
published:  true 
catalog: true
tags:
    - go
    - helm
---

## 说明
通过源码了解 `helm install` 的执行流程，helm 版本为 `v2.17.0`

## 客户端
#### 1. helm 的 main 函数（cmd/helm/helm.go）

   main 函数很好理解，调用了 newRootCmd()，就是 helm 命令的实现，函数内部通过 Cobra 的 AddCommand() 添加了 helm 的所有子命令，其他的就是解析参数，初始化环境变量等。有个地方需要注意，它声明了 PersistentPostRun() ，这个函数在 Run() 函数结束后将被执行，也就是一个收尾操作，收尾操作里执行了一个 teardown() 函数，看下它的内容：
   ``` go
   func teardown() {
        if tillerTunnel != nil {
            tillerTunnel.Close()
        }
    }
   ```
   也就是说，每次执行命令之后都会把这个 tillerTunnel 关闭掉，这个 tillerTunnel 是本地到 tiller server 的一个连接，后面再讲。
   
#### 2. helm install 的实现
   直接看 newInstallCmd() 的内容，比较简单，不展示代码了（cmd/helm/install.go）
   
   RunE() 函数最终调用的是 inst.run()，在此之前的 locateChartPath() 是根据命令行传入的 chart 目录或压缩包解析得到其绝对路径。此外，还需要注意 PreRunE 里调用的 setupConnection()，以及 inst.client 的赋值也比较重要，这两个后面再看，先看 inst.run() 的主要内容。
   ``` go
    func (i *installCmd) run() error {
        debug("CHART PATH: %s\n", i.chartPath)

        // 如果命名空间为空，则会根据kubeconfig设置，如果出现异常，则会设为default
        if i.namespace == "" {
            i.namespace = defaultNamespace()
        }

        // 用于解析命令行参数的 values，包括 --set、--set-file、--set-string，这些 values 会覆盖 values.yaml 文件的默认参数
        rawVals, err := vals(i.valueFiles, i.values, i.stringValues, i.fileValues, i.certFile, i.keyFile, i.caFile)
        if err != nil {
            return err
        }
        // 省略部分代码，下同
        ...

        // 把 chart 包转换成 Chart 对象
        // Check chart requirements to make sure all dependencies are present in /charts
        chartRequested, err := chartutil.Load(i.chartPath)
        if err != nil {
            return prettyError(err)
        }

        if chartRequested.Metadata.Deprecated {
            fmt.Fprintln(os.Stderr, "WARNING: This chart is deprecated")
        }
        
        // 加载 requirements.yaml 文件，并检查是否有依赖其他 chart 包，有的话将依赖的 chart 对象合并到 chartRequested，没有则不处理
        if req, err := chartutil.LoadRequirements(chartRequested); err == nil {
            ...
        } else if err != chartutil.ErrRequirementsNotFound {
            return fmt.Errorf("cannot load requirements: %v", err)
        }
        
        // 通过 client 去安装 chart
        res, err := i.client.InstallReleaseFromChart(
            chartRequested,
            i.namespace,
            helm.ValueOverrides(rawVals),
            helm.ReleaseName(i.name),
            helm.InstallDryRun(i.dryRun),
            helm.InstallReuseName(i.replace),
            helm.InstallDisableHooks(i.disableHooks),
            helm.InstallDisableCRDHook(i.disableCRDHook),
            helm.InstallSubNotes(i.subNotes),
            helm.InstallTimeout(i.timeout),
            helm.InstallWait(i.wait),
            helm.InstallDescription(i.description))
        if err != nil {
            ...
        }

        rel := res.GetRelease()
        if rel == nil {
            return nil
        }
        ...

        // 获取刚刚创建的 release 的状态
        // Print the status like status command does
        status, err := i.client.ReleaseStatus(rel.Name)
        if err != nil {
            return prettyError(err)
        }
        // 返回给用户
        return write(i.out, &statusWriter{status}, outputFormat(i.output))
    }
   ```
   
   整个过程还是比较简单的，来看下几个重要的部分：
   1. chart 是如何被转换成 Chart 对象的，即 chartutil.Load(i.chartPath) 的详细过程
   2. chart 是如何被安装到 k8s 集群的，即 i.client.InstallReleaseFromChart() 的详细过程
   3. i.client 是什么
   
#### 3. chart 是如何被转换成 Chart 对象的

   看下 chartutil.Load(i.chartPath) 的代码（pkg/chartutil/load.go），它会判断传入的参数是否是目录，是则调用 LoadDir()，否则当做压缩包调用 LoadFile()。比如，通过目录部署 helm install ./mychart，则调用 LoadDir()，通过压缩包部署 helm install ./mychart.tgz，则调用 LoadFile()
   ``` go
    func Load(name string) (*chart.Chart, error) {
        name = filepath.FromSlash(name)
        fi, err := os.Stat(name)
        if err != nil {
            return nil, err
        }
        if fi.IsDir() {
            if validChart, err := IsChartDir(name); !validChart {
                return nil, err
            }
            return LoadDir(name)
        }
        return LoadFile(name)
    }
   ```
   
   先看 LoadFile()，比较简单，这里就不贴代码了，它会判断文件是否存在，然后打开这个文件，再判断这个文件是否是压缩包格式，再通过调用 LoadArchive() 得到 Chart 对象，看下 LoadArchive() 代码：
   ``` go
   // LoadArchive loads from a reader containing a compressed tar archive.
    func LoadArchive(in io.Reader) (*chart.Chart, error) {
        // 解析 chart 压缩包的内容，返回的 files 存储了整个 chart 内容
        files, err := loadArchiveFiles(in)
        if err != nil {
            return nil, err
        }
        return LoadFiles(files)
    }
   ```
   
   将 chart 转换成 Chart 对象的主要代码如下：
   ``` go
   // LoadFiles loads from in-memory files.
    func LoadFiles(files []*BufferedFile) (*chart.Chart, error) {
        // 初始化一个 Chart 对象
        c := &chart.Chart{}
        subcharts := map[string][]*BufferedFile{}
        
        // 遍历 loadArchiveFiles() 返回的 files，最后得到一个完整的 Chart 对象
        for _, f := range files {
            if f.Name == "Chart.yaml" {
                m, err := UnmarshalChartfile(f.Data)
                if err != nil {
                    return c, err
                }
                c.Metadata = m
                var apiVersion = c.Metadata.ApiVersion
                if apiVersion != "" && apiVersion != ApiVersionV1 {
                    return c, fmt.Errorf("apiVersion '%s' is not valid. The value must be \"v1\"", apiVersion)
                }
            } else if f.Name == "values.toml" {
                return c, errors.New("values.toml is illegal as of 2.0.0-alpha.2")
            } else if f.Name == "values.yaml" {
                c.Values = &chart.Config{Raw: string(f.Data)}
            } else if strings.HasPrefix(f.Name, "templates/") {
                c.Templates = append(c.Templates, &chart.Template{Name: f.Name, Data: f.Data})
            } else if strings.HasPrefix(f.Name, "charts/") {
                if filepath.Ext(f.Name) == ".prov" {
                    c.Files = append(c.Files, &any.Any{TypeUrl: f.Name, Value: f.Data})
                    continue
                }
                cname := strings.TrimPrefix(f.Name, "charts/")
                if strings.IndexAny(cname, "._") == 0 {
                    // Ignore charts/ that start with . or _.
                    continue
                }
                parts := strings.SplitN(cname, "/", 2)
                scname := parts[0]
                subcharts[scname] = append(subcharts[scname], &BufferedFile{Name: cname, Data: f.Data})
            } else {
                c.Files = append(c.Files, &any.Any{TypeUrl: f.Name, Value: f.Data})
            }
        }
        
        ...
        // 依赖的 chart 也会转换到 Chart 对象
        for n, files := range subcharts {
            ...
        }
    }
   ```
   
   上面的 files 参数是一个 BufferFile 类型的数组，BufferFile 类型声明如下，仅有 Name 和 Data 两个字段：
   ``` go
   // BufferedFile represents an archive file buffered for later processing.
    type BufferedFile struct {
        Name string
        Data []byte
    }
   ```
   结合上面代码可以知道，Name 存放的是文件名，Data 存放的是文件内容，也就是说 loadArchiveFiles() 做的事情就是把压缩包的所有文件名和文件内容（包括依赖的 chart）都存储在了一个 BufferedFile 类型的数组。而 LoadFiles() 通过遍历这个数组，给初始化的 Chart 赋值，最后得到了一个完整的 Chart 对象，以上就是通过压缩包部署的主要逻辑。
   
   再去看通过 chart 目录部署的核心代码，即 LoadDir()，代码如下：
   ``` go
    // LoadDir loads from a directory.
    //
    // This loads charts only from directories.
    func LoadDir(dir string) (*chart.Chart, error) {
        topdir, err := filepath.Abs(dir)
        if err != nil {
            return nil, err
        }

        // Just used for errors.
        c := &chart.Chart{}

        // 读取 .helmignore 的内容
        rules := ignore.Empty()
        ifile := filepath.Join(topdir, ignore.HelmIgnore)
        if _, err := os.Stat(ifile); err == nil {
            r, err := ignore.ParseFile(ifile)
            if err != nil {
                return c, err
            }
            rules = r
        }
        rules.AddDefaults()

        files := []*BufferedFile{}
        topdir += string(filepath.Separator)

        walk := func(name string, fi os.FileInfo, err error) error {
            n := strings.TrimPrefix(name, topdir)
            if n == "" {
                // No need to process top level. Avoid bug with helmignore .* matching
                // empty names. See issue 1779.
                return nil
            }

            // Normalize to / since it will also work on Windows
            n = filepath.ToSlash(n)

            if err != nil {
                return err
            }
            if fi.IsDir() {
                // Directory-based ignore rules should involve skipping the entire
                // contents of that directory.
                if rules.Ignore(n, fi) {
                    return filepath.SkipDir
                }
                return nil
            }
            
            // 匹配到 .helmignore 中定义的文件，则不会存储到 files
            // If a .helmignore file matches, skip this file.
            if rules.Ignore(n, fi) {
                return nil
            }

            // Irregular files include devices, sockets, and other uses of files that
            // are not regular files. In Go they have a file mode type bit set.
            // See https://golang.org/pkg/os/#FileMode for examples.
            if !fi.Mode().IsRegular() {
                return fmt.Errorf("cannot load irregular file %s as it has file mode type bits set", name)
            }
            
            // 根据文件名读取文件内容
            data, err := ioutil.ReadFile(name)
            if err != nil {
                return fmt.Errorf("error reading %s: %s", n, err)
            }
            
            // 存储到 files
            files = append(files, &BufferedFile{Name: n, Data: data})
            return nil
        }
        // 遍历整个目录，处理所有文件
        if err = sympath.Walk(topdir, walk); err != nil {
            return c, err
        }
        
        // 调用 LoadFiles 得到 Chart 对象
        return LoadFiles(files)
    }
   ```
   
   可以看出，和处理压缩包的原理也是一样，也把目录下的所有文件存储在了 BufferedFile 数组，最后调用 LoadFiles() 得到 Chart 对象。不过有一点差异的是，目录部署没有把在 .helmignore 中忽略的文件存到 BufferedFile 数组，而压缩包部署则是存储了所有。
   
   以上就是 chart 被转换成 Chart 对象的过程，没什么花头，就是读取 chart 的所有文件，再赋值给 Chart 对象而已。

#### 4. chart 是如何被安装到 k8s 集群的

   拿到 Chart 对象之后，调用了 i.client.InstallReleaseFromChart() 去安装 chart，通过跳转可以定位到函数声明的地方（pkg/helm/client.go），经过层层调用，通过以下函数构造一个 rls.InstallReleaseRequest 对象:
   ``` go
    // InstallReleaseFromChartWithContext installs a new chart and returns the release response while accepting a context.
    func (h *Client) installReleaseFromChartWithContext(ctx context.Context, chart *chart.Chart, ns string, opts ...InstallOption) (*rls.InstallReleaseResponse, error) {
        // 构造 rls.InstallReleaseRequest 对象
        // apply the install options
        reqOpts := h.opts
        for _, opt := range opts {
            opt(&reqOpts)
        }
        req := &reqOpts.instReq
        req.Chart = chart
        req.Namespace = ns
        req.DryRun = reqOpts.dryRun
        req.DisableHooks = reqOpts.disableHooks
        req.DisableCrdHook = reqOpts.disableCRDHook
        req.ReuseName = reqOpts.reuseName
        ctx = FromContext(ctx)

        if reqOpts.before != nil {
            if err := reqOpts.before(ctx, req); err != nil {
                return nil, err
            }
        }
        err := chartutil.ProcessRequirementsEnabled(req.Chart, req.Values)
        if err != nil {
            return nil, err
        }
        err = chartutil.ProcessRequirementsImportValues(req.Chart)
        if err != nil {
            return nil, err
        }

        return h.install(ctx, req)
    }
   ```
   
   最后实际调用的是下面这个函数发送请求：
   ``` go
   // install executes tiller.InstallRelease RPC.
    func (h *Client) install(ctx context.Context, req *rls.InstallReleaseRequest) (*rls.InstallReleaseResponse, error) {
        // 建立 RPC 连接
        c, err := h.connect(ctx)
        if err != nil {
            return nil, err
        }
        defer c.Close()
        
        // 调用 RPC 接口，将数据发送给 tiller server
        rlc := rls.NewReleaseServiceClient(c)
        return rlc.InstallRelease(ctx, req)
    }
   ```
   到这里就可以看出其实就是先建立一个到 tiller 的 RPC 连接，再通过 RPC 接口调用 tiller 服务，最后由 tiller 服务来部署 chart，也就是说 chart 的安装是在 tiller 服务里执行的，这个我们等会再看。
   
   先来看下是如何建立到 tiller 的连接的，即 connect 内容：
   ``` go
    // connect returns a gRPC connection to Tiller or error. The gRPC dial options
    // are constructed here.
    func (h *Client) connect(ctx context.Context) (conn *grpc.ClientConn, err error) {
        // 建立 RPC 连接时的可选参数
        opts := []grpc.DialOption{
            grpc.WithBlock(),
            grpc.WithKeepaliveParams(keepalive.ClientParameters{
                // Send keepalive every 30 seconds to prevent the connection from
                // getting closed by upstreams
                Time: time.Duration(30) * time.Second,
            }),
            grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(maxMsgSize)),
        }
        switch {
        case h.opts.useTLS:
            opts = append(opts, grpc.WithTransportCredentials(credentials.NewTLS(h.opts.tlsConfig)))
        default:
            opts = append(opts, grpc.WithInsecure())
        }
        ctx, cancel := context.WithTimeout(ctx, h.opts.connectTimeout)
        defer cancel()
        // 调用 grpc 包建立连接，注意 h.opts.host 参数是如何确定的
        if conn, err = grpc.DialContext(ctx, h.opts.host, opts...); err != nil {
            return nil, err
        }
        return conn, nil
    }
   ```
   这里有个问题，h.opts.host 究竟是多少？也就是 tiller 服务的地址是如何赋值的？ok，需要回过头去看 i.client.InstallReleaseFromChart() 的 i.client 是如何赋值的。
    
#### 5. i.client 是如何赋值的

   来看下 newInstallCmd() 的部分代码：
   ``` go
    func newInstallCmd(c helm.Interface, out io.Writer) *cobra.Command {
        // inst 初始化，这里的 c 是 nil，在 helm.go 里调用时传入的
        inst := &installCmd{
            out:    out,
            client: c,
        }

        cmd := &cobra.Command{
            Use:     "install [CHART]",
            Short:   "Install a chart archive",
            Long:    installDesc,
            PreRunE: func(_ *cobra.Command, _ []string) error { return setupConnection() },
            RunE: func(cmd *cobra.Command, args []string) error {
                ... 
                // client 赋值就是这里了
                inst.client = ensureHelmClient(inst.client)
                inst.wait = inst.wait || inst.atomic

                return inst.run()
            },
        }
    }
   ```
   
   接着看 ensureHelmClient() 的代码，调用了 newClient() (cmd/helm/helm.go)
   ``` go
    // ensureHelmClient returns a new helm client impl. if h is not nil.
    func ensureHelmClient(h helm.Interface) helm.Interface {
        if h != nil {
            return h
        }
        return newClient()
    }
   ```
   
   newClient代码：
   ``` go
    func newClient() helm.Interface {
        // 初始化 tiller 的地址和连接 tiller 的超时时间
        options := []helm.Option{helm.Host(settings.TillerHost), helm.ConnectTimeout(settings.TillerConnectionTimeout)}

        if settings.TLSVerify || settings.TLSEnable {
            debug("Host=%q, Key=%q, Cert=%q, CA=%q\n", settings.TLSServerName, settings.TLSKeyFile, settings.TLSCertFile, settings.TLSCaCertFile)
            tlsopts := tlsutil.Options{
                ServerName:         settings.TLSServerName,
                KeyFile:            settings.TLSKeyFile,
                CertFile:           settings.TLSCertFile,
                InsecureSkipVerify: true,
            }
            if settings.TLSVerify {
                tlsopts.CaCertFile = settings.TLSCaCertFile
                tlsopts.InsecureSkipVerify = false
            }
            tlscfg, err := tlsutil.ClientConfig(tlsopts)
            if err != nil {
                fmt.Fprintln(os.Stderr, err)
                os.Exit(2)
            }
            options = append(options, helm.WithTLS(tlscfg))
        }
        // 即 newInstallCmd() 中赋给 i.client 的值
        return helm.NewClient(options...)
    }
   ```
   
   也就是说 tiller 的地址来自 settings.TillerHost，这里的 settings 是 environment 包的 EnvSettings 类型（pkg/helm/environment/environment.go），在 cmd/helm/helm.go 里初始化的
   ``` go
    var (
        tillerTunnel *kube.Tunnel
        // helm_env 就是 "pkg/helm/environment"
        settings     helm_env.EnvSettings
    )
   ```
   TillerHost 是 EnvSettings 类型的一个字段，通过 AddFlags() 函数发现，可以通过命令行参数 `host` 给 TillerHost 赋值，并会覆盖 $HELM_HOST 变量，默认是空字符串。settings.AddFlags() 是在 newRootCmd() 中调用的，也就是入口函数里。
   ``` go
    // AddFlags binds flags to the given flagset.
    func (s *EnvSettings) AddFlags(fs *pflag.FlagSet) {
        ...
        fs.StringVar(&s.TillerHost, "host", "", "Address of Tiller. Overrides $HELM_HOST")
        ...
    }
   ```
   什么？默认是空字符串？那是怎么和 tiller 建立连接的？肯定有个地方赋值了的。
   
   还记得第二点提到的 PreRunE 中调用的 setupConnection() 吗？就是在这里赋值的：
   ``` go
   func setupConnection() error {
        if settings.TillerHost == "" {
            config, client, err := getKubeClient(settings.KubeContext, settings.KubeConfig)
            if err != nil {
                return err
            }
            
            // 这里的 tillerTunnel 是本地到 tiller Pod 的一个通信隧道，隧道的建立就是通过端口转发的
            tillerTunnel, err = portforwarder.New(settings.TillerNamespace, client, config)
            if err != nil {
                return err
            }
            
            // tiller 的地址设为本地地址和一个随机端口
            settings.TillerHost = fmt.Sprintf("127.0.0.1:%d", tillerTunnel.Local)
            debug("Created tunnel using local port: '%d'\n", tillerTunnel.Local)
        }

        // Set up the gRPC config.
        debug("SERVER: %q\n", settings.TillerHost)

        // Plugin support.
        return nil
    }
   ```
   
   因为 PreRunE 会在参数解析之后程序正式运行之前才会被执行，所以命令行没有设置 host 参数导致 TillerHost 为空也没有关系，setupConnection() 里会设置。从这个函数的内容可以看出，如果 TillerHost 为空，则把其地址设为 `fmt.Sprintf("127.0.0.1:%d", tillerTunnel.Local)`，这个 tillerTunnel.Local 是本地随机监听的一个端口。
   
#### 6. portforward 端口转发建立连接隧道

   看下 portforwarder.New() 的代码：
   ``` go
   // New creates a new and initialized tunnel.
    func New(namespace string, client kubernetes.Interface, config *rest.Config) (*kube.Tunnel, error) {
        // 获取 tiller 的 pod 名称
        podName, err := GetTillerPodName(client.CoreV1(), namespace)
        if err != nil {
            return nil, err
        }
        // 初始化 tunnel，使用 tiller 的默认 44134 端口
        t := kube.NewTunnel(client.CoreV1().RESTClient(), config, namespace, podName, environment.DefaultTillerPort)
        // 建立隧道的代码在 t.ForwardPort 
        return t, t.ForwardPort()
    }
   ```
   首先会获取当前 tiller 的 pod 名称（有多个则获取第一个 pod的），然后把 pod 名称和默认的 tiller 端口传给 kube.NewTunnel()并调用，NewTunnel()是初始化一个 Tunnel 对象，实际建立隧道连接的是 t.ForwardPort()
   ``` go
   // ForwardPort opens a tunnel to a kubernetes pod
    func (t *Tunnel) ForwardPort() error {
        // Build a url to the portforward endpoint
        // example: http://localhost:8080/api/v1/namespaces/helm/pods/tiller-deploy-9itlq/portforward
        u := t.client.Post().
            Resource("pods").
            Namespace(t.Namespace).
            Name(t.PodName).
            SubResource("portforward").URL()

        transport, upgrader, err := spdy.RoundTripperFor(t.config)
        if err != nil {
            return err
        }
        dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, "POST", u)

        // 本地随机监听一个端口
        local, err := getAvailablePort()
        if err != nil {
            return fmt.Errorf("could not find an available port: %s", err)
        }
        t.Local = local

        // 本地端口到 tiller pod 的端口，t.Remote 就是 environment.DefaultTillerPort
        ports := []string{fmt.Sprintf("%d:%d", t.Local, t.Remote)}

        // 建立本地端口到 tiller pod 的端口的连接隧道，这里的 portforward.New 是 client-go 提供的
        pf, err := portforward.New(dialer, ports, t.stopChan, t.readyChan, t.Out, t.Out)
        if err != nil {
            return err
        }

        errChan := make(chan error)
        go func() {
            errChan <- pf.ForwardPorts()
        }()

        select {
        case err = <-errChan:
            return fmt.Errorf("forwarding ports: %v", err)
        case <-pf.Ready:
            return nil
        }
    }
   ```
   
   该端口转发的方式其实就是 kubernetes 提供的 `kubectl port-forward` 命令。当我们访问本地这个端口时，也就相当于访问 tiller pod 的默认 44134 端口，即：
   ```
   127.0.0.1:随机端口 ---> podIP:44134
   ```
   
   连接建立后，就可以正常通信了，以上，就是执行 helm install 的客户端的流程，下面接着看服务端的流程。
   
## 服务端
#### 7. 服务端 tiller 是如何处理客户端 install 请求的

   通过 RPC 接口可以知道，服务端调用的是 `func (s *ReleaseServer) InstallRelease(c ctx.Context, req *services.InstallReleaseRequest) (*services.InstallReleaseResponse, error)`（位于 pkg/tiller/release_install.go），代码如下：
   ``` go
   // InstallRelease installs a release and stores the release record.
    func (s *ReleaseServer) InstallRelease(c ctx.Context, req *services.InstallReleaseRequest) (*services.InstallReleaseResponse, error) {
    	s.Log("preparing install for %s", req.Name)
        // 预处理，准备创建 release 和 k8s 资源的数据
        rel, err := s.prepareRelease(req)
        if err != nil {
            s.Log("failed install prepare step: %s", err)
            res := &services.InstallReleaseResponse{Release: rel}

            // On dry run, append the manifest contents to a failed release. This is
            // a stop-gap until we can revisit an error backchannel post-2.0.
            if req.DryRun && strings.HasPrefix(err.Error(), "YAML parse error") {
                err = fmt.Errorf("%s\n%s", err, rel.Manifest)
            }
            return res, err
        }

        s.Log("performing install for %s", req.Name)
        // 创建release，创建k8s资源
        res, err := s.performRelease(rel, req)
        if err != nil {
            s.Log("failed install perform step: %s", err)
        }
        return res, err
    }
   ```
   执行过程分为两步，分别是 prepareRelease() 预处理和 performRelease() 实际执行。
   
   预处理就是准备创建 release 和 k8s 资源所需的数据：
   ``` go
   // prepareRelease builds a release for an install operation.
    func (s *ReleaseServer) prepareRelease(req *services.InstallReleaseRequest) (*release.Release, error) {
        ...
        // 生成值，用于后面的模板渲染
        valuesToRender, err := chartutil.ToRenderValuesCaps(req.Chart, req.Values, options, caps)
        ...
        // 渲染 manifest、notes，manifestDoc 就是需要创建的所有 k8s 资源
        hooks, manifestDoc, notesTxt, err := s.renderResources(req.Chart, valuesToRender, req.SubNotes, caps.APIVersions)
        ...

        // 构造release对象并返回
        // Store a release.
        rel := &release.Release{
            Name:      name,
            Namespace: req.Namespace,
            Chart:     req.Chart,
            Config:    req.Values,
            Info: &release.Info{
                FirstDeployed: ts,
                LastDeployed:  ts,
                Status:        &release.Status{Code: release.Status_PENDING_INSTALL},
                Description:   "Initial install underway", // Will be overwritten.
            },
            Manifest: manifestDoc.String(),
            Hooks:    hooks,
            Version:  int32(revision),
        }
        if len(notesTxt) > 0 {
            rel.Info.Status.Notes = notesTxt
        }

        return rel, nil
    }
   ```
   
   performRelease() 就是创建 release 和 k8s 资源，看下代码：
   ``` go
    func (s *ReleaseServer) performRelease(r *release.Release, req *services.InstallReleaseRequest) (*services.InstallReleaseResponse, error) {
       ...
       switch h, err := s.env.Releases.History(req.Name); {
        // 名称已存在且指定了replace，则为更新操作
        // if this is a replace operation, append to the release history
        case req.ReuseName && err == nil && len(h) >= 1:
            ...
            s.recordRelease(r, false)
            if err := s.ReleaseModule.Update(old, r, updateReq, s.env); err != nil {
                msg := fmt.Sprintf("Release replace %q failed: %s", r.Name, err)
                s.Log("warning: %s", msg)
                old.Info.Status.Code = release.Status_SUPERSEDED
                r.Info.Status.Code = release.Status_FAILED
                r.Info.Description = msg
                s.recordRelease(old, true)
                s.recordRelease(r, true)
                return res, err
            }

        default:
            // 默认为新增操作
            // nothing to replace, create as normal
            // regular manifests
            s.recordRelease(r, false)
            if err := s.ReleaseModule.Create(r, req, s.env); err != nil {
                msg := fmt.Sprintf("Release %q failed: %s", r.Name, err)
                s.Log("warning: %s", msg)
                r.Info.Status.Code = release.Status_FAILED
                r.Info.Description = msg
                s.recordRelease(r, true)
                return res, fmt.Errorf("release %s failed: %s", r.Name, err)
            }
        }
    }
   ```
   前面是 dry-run、hooks 的判断以及 manifest 的校验，主要看 switch 那块代码，它会先获取同名 release 的历史记录，如果找到历史记录且允许使用相同的名字，则对 release 执行 update 操作，否则默认执行 release 的新增操作，最后返回一个 InstallReleaseResponse 的对象。
   
   接着看 default 部分，调用了两个函数，s.recordRelease() 和 s.ReleaseModule.Create()，先看下 recordRelease 的代码：
   ``` go
   // recordRelease with an update operation in case reuse has been set.
    func (s *ReleaseServer) recordRelease(r *release.Release, reuse bool) {
        if reuse {
            if err := s.env.Releases.Update(r); err != nil {
                s.Log("warning: Failed to update release %s: %s", r.Name, err)
            }
        } else if err := s.env.Releases.Create(r); err != nil {
            s.Log("warning: Failed to record release %s: %s", r.Name, err)
        }
    }
   ```
   其中，s.env 是在 tiller server 启动时赋值的（cmd/tiller/tiller.go），它是一个 Environment 类型，这个类型包含三个字段，声明如下：
   ``` go
    // Environment provides the context for executing a client request.
    //
    // All services in a context are concurrency safe.
    type Environment struct {
        // EngineYard provides access to the known template engines.
        EngineYard EngineYard
        // Releases stores records of releases.
        Releases *storage.Storage
        // KubeClient is a Kubernetes API client.
        KubeClient KubeClient
    }
   ```
   我们只看 Release，s.env.Release 是一个 storage.Storage 类型，这个类型包含了一个 driver.Driver 接口，tiller 里面实现了 Memory、ConfigMap、Secret、SQL 四种驱动接口，所以这里的 s.env.Release 其实就是一个存储引擎，env 初始化的时候默认存储引擎是 Memory，而 tiller 的启动参数默认使用的 ConfigMap，也就是说 release 默认是存储在 ConfigMap 的。
   所以，上述 s.env.Releases.Create(r) 调用的其实是 ConfigMap 驱动的 Create 方法（pkg/storage/driver/cfgmaps.go），代码如下：
   ```go
    // Create creates a new ConfigMap holding the release. If the
    // ConfigMap already exists, ErrReleaseExists is returned.
    func (cfgmaps *ConfigMaps) Create(key string, rls *rspb.Release) error {
        // set labels for configmaps object meta data
        var lbs labels

        lbs.init()
        lbs.set("CREATED_AT", strconv.Itoa(int(time.Now().Unix())))

        // 创建一个包含 release 的 ConfigMap 对象
        // create a new configmap to hold the release
        obj, err := newConfigMapsObject(key, rls, lbs)
        if err != nil {
            cfgmaps.Log("create: failed to encode release %q: %s", rls.Name, err)
            return err
        }
        // 这里的 impl 是在 tiller.go 里初始化 ConfigMap 存储引擎的时候传入的 clientset.CoreV1().ConfigMaps(namespace())
        // push the configmap object out into the kubiverse
        if _, err := cfgmaps.impl.Create(obj); err != nil {
            if apierrors.IsAlreadyExists(err) {
                return storageerrors.ErrReleaseExists(key)
            }

            cfgmaps.Log("create: failed to create: %s", err)
            return err
        }
        return nil
    }
   ```
   可以很清楚的看到，最终是通过 clientset 创建 ConfigMap 资源。去集群里查看 ConfigMap 资源，可以看到每个 release 版本都是存储在一个ConfigMap 中的。
   
   到这里，release 的处理就结束了，剩下的就是创建 k8s 资源了，即 s.ReleaseModule.Create()
   
   这个 s.ReleaseModule 是一个 ReleaseModule 接口，有 LocalReleaseModule 和 RemoteReleaseModule 两种实现，其初始值根据 useRemote 的值来决定的，默认情况是 false，即使用 LocalReleaseModule：
   ``` go
    // NewReleaseServer creates a new release server.
    func NewReleaseServer(env *environment.Environment, clientset kubernetes.Interface, useRemote bool) *ReleaseServer {
        var releaseModule ReleaseModule
        if useRemote {
            releaseModule = &RemoteReleaseModule{}
        } else {
            releaseModule = &LocalReleaseModule{
                clientset: clientset,
            }
        }

        return &ReleaseServer{
            env:           env,
            clientset:     clientset,
            ReleaseModule: releaseModule,
            Log:           func(_ string, _ ...interface{}) {},
        }
    }
   ```
   
   查看 LocalReleaseModule 的 Create 方法：
   ```
    // Create creates a release via kubeclient from provided environment
    func (m *LocalReleaseModule) Create(r *release.Release, req *services.InstallReleaseRequest, env *environment.Environment) error {
        b := bytes.NewBufferString(r.Manifest)
        return env.KubeClient.Create(r.Namespace, b, req.Timeout, req.Wait)
    }
   ```
   
   其中 env.KubeClient 是在 tiller 服务初始化时赋值的，调用了 kube.New()：
   ``` go
    func start() {
        ...
        kubeClient := kube.New(nil)
        kubeClient.Log = newLogger("kube").Printf
        env.KubeClient = kubeClient
        ...
    }
   ```
   
   因此，env.KubeClient.Create() 实际上调用的是 kube 包里 Client 类型的 Create 方法，通过代码可以看出，最终也是通过 clientset 创建 k8s 资源的，如下：
   ``` go
    // Create creates Kubernetes resources from an io.reader.
    //
    // Namespace will set the namespace.
    func (c *Client) Create(namespace string, reader io.Reader, timeout int64, shouldWait bool) error {
        client, err := c.KubernetesClientSet()
        if err != nil {
            return err
        }
        if err := ensureNamespace(client, namespace); err != nil {
            return err
        }
        c.Log("building resources from manifest")
        infos, buildErr := c.BuildUnstructured(namespace, reader)
        if buildErr != nil {
            return buildErr
        }
        c.Log("creating %d resource(s)", len(infos))
        // createResource 是一个辅助函数，用户创建 k8s 资源
        if err := perform(infos, createResource); err != nil {
            return err
        }
        if shouldWait {
            return c.waitForResources(time.Duration(timeout)*time.Second, infos)
        }
        return nil
    }
   ```
   
   c.BuildUnstructured() 用于构造一个 unstructured 的数据，再通过 perform() 函数去创建资源，查看 perform 调用的 batchPerform 代码可以发现，它是并行去创建不同 GVK 的资源的。
   ``` go
    func batchPerform(infos Result, fn ResourceActorFunc, errs chan<- error) {
        var kind string
        var wg sync.WaitGroup
        for _, info := range infos {
            currentKind := info.Object.GetObjectKind().GroupVersionKind().Kind
            if kind != currentKind {
                wg.Wait()
                kind = currentKind
            }
            wg.Add(1)
            // 并行创建资源
            go func(i *resource.Info) {
                errs <- fn(i)
                wg.Done()
            }(info)
        }
    }
   ```
   
   最后，回到第一点的 PersistentPostRun，资源创建完毕后，命令结束之前会调用 teardown() 函数，来关闭本地端口到 tiller pod 的连接隧道，至此，整个 helm install 的流程就结束了。
   
   简单总结一下整个 install 的过程就是：将 chart 转换成一个 Chart 对象，再构造一个 InstallReleaseRequest 对象，客户端与 tiller 服务端通过端口转发的形式建立 rpc 连接，然后把这个对象发给 tiller 服务端，服务端接收到 install 请求后，会新建一个 release，并把这个 release 存储在 ConfigMap 中，最后通过 clientset 去创建 k8s 资源。
