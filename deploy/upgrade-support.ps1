# Shared Windows deployment, service-control and upgrade helpers.
function Get-FuTaskRoot($Task) {
    if (-not $Task) { return $null }
    $actions = @($Task.Actions)
    if ($actions.Count -ne 1 -or [IO.Path]::GetFileName($actions[0].Execute) -ne 'node.exe' -or
        $actions[0].Arguments -notmatch '^"([^"]+[\\/]launch\.mjs)" --background$') {
        throw 'FabulaUltima 任务不是可识别的 FU 启动任务，未修改它。'
    }
    $root = [IO.Path]::GetFullPath((Split-Path -Parent $Matches[1])).TrimEnd('\', '/')
    if (-not $actions[0].WorkingDirectory -or
        [IO.Path]::GetFullPath($actions[0].WorkingDirectory).TrimEnd('\', '/') -ne $root) {
        throw 'FU 后台任务的入口与工作目录不一致，未修改它。'
    }
    $info = Join-Path $root 'app/build-info.json'
    if (-not (Test-Path -LiteralPath $info -PathType Leaf) -or
        (Get-Content -LiteralPath $info -Raw -Encoding UTF8 | ConvertFrom-Json).product -ne 'fabula-table') {
        throw '无法确认原后台任务属于 FU 安装，未修改它。'
    }
    return $root
}

function Assert-FuFreshDirectory([string]$Root) {
    if (Test-Path -LiteralPath (Join-Path $Root '.env')) {
        throw '此文件夹已有部署配置。全新安装请把完整包解压到另一个空文件夹；启动已安装的版本请用 start.bat。'
    }
    $data = Join-Path $Root 'data'
    if (Test-Path -LiteralPath $data) {
        if ((Get-Item -LiteralPath $data).Attributes -band [IO.FileAttributes]::ReparsePoint -or
            @(Get-ChildItem -LiteralPath $data -Force).Count -gt 0) {
            throw '此文件夹已有数据。请把完整包解压到另一个空文件夹，再运行 install.bat。'
        }
    }
}

function Get-FuOwnedProcesses([string]$Launch, [string]$App) {
    @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $line = $_.CommandLine -replace '/', '\'
        $line -match ('(?i)(?:^|[\s"])' + [regex]::Escape($Launch) + '(?:[\s"]|$)') -or
        $line -match ('(?i)(?:^|[\s"])' + [regex]::Escape((Join-Path $App 'server.mjs')) + '(?:[\s"]|$)')
    })
}

function Stop-FuDeployment($Task, [string]$Launch, [string]$App, [int]$TimeoutSeconds = 20) {
    if ($Task) { Stop-ScheduledTask -TaskName $Task.TaskName -TaskPath $Task.TaskPath }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    do {
        $owned = @(Get-FuOwnedProcesses $Launch $App)
        foreach ($process in $owned) { Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue }
        $busy = $false
        if ($Task) {
            $current = Get-ScheduledTask -TaskName $Task.TaskName -TaskPath $Task.TaskPath
            $busy = $current.State -in @('Running', 'Queued')
        }
        if (-not $busy -and $owned.Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    } while ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds)
    throw '原 FU 后台任务或进程仍未停止，暂不替换程序。请检查任务计划程序中的 FabulaUltima。'
}

function Get-FuHealthUrl($Config) {
    $port = if ($Config['FU_PORT']) { [int]$Config['FU_PORT'] } else { 3340 }
    $base = if ($Config['FU_BASE_PATH']) { $Config['FU_BASE_PATH'].TrimEnd('/') } else { '' }
    $address = $Config['FU_HOST']
    if (-not $address -or $address -eq '0.0.0.0') { $address = '127.0.0.1' }
    if ($address -eq '::') { $address = '::1' }
    if ($address.Contains(':') -and -not $address.StartsWith('[')) { $address = "[$address]" }
    return "http://${address}:$port$base/api/health"
}

function Wait-FuHealth([string]$Url, [string]$Version, [int]$TimeoutSeconds = 60) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $lastError = '服务尚未响应'
    do {
        $response = $null; $reader = $null
        try {
            $request = [Net.HttpWebRequest]::Create($Url)
            $request.Proxy = $null
            $request.Timeout = 1200
            $request.ReadWriteTimeout = 1200
            $response = $request.GetResponse()
            $reader = [IO.StreamReader]::new($response.GetResponseStream())
            $health = $reader.ReadToEnd() | ConvertFrom-Json
            if ($health.ok -and $health.product -eq 'fabula-table' -and $health.version -eq $Version) {
                return [pscustomobject]@{ Healthy = $true; Detail = "FU $Version 已响应" }
            }
            $lastError = "响应版本不匹配：期待 FU $Version，实际 $($health.product) $($health.version)"
        } catch { $lastError = $_.Exception.GetBaseException().Message }
        finally {
            if ($reader) { $reader.Dispose() }
            if ($response) { $response.Dispose() }
        }
        if ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds) { Start-Sleep -Milliseconds 500 }
    } while ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds)
    return [pscustomobject]@{ Healthy = $false; Detail = $lastError }
}

function Get-FuStartupLog([string]$Path, [long]$Offset) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '本次启动未产生 server.log。请结合任务状态检查启动权限和运行环境。' }
    $stream = [IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
    try {
        if ($Offset -gt $stream.Length) { $Offset = 0 }
        $start = [Math]::Max($Offset, $stream.Length - 16384)
        if ($start -eq $stream.Length) { return '本次启动未写入新的 server.log 内容。' }
        $stream.Seek($start, 'Begin') | Out-Null
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally { $stream.Dispose() }
}

function Write-FuStartupReport([string]$Report, [string]$Reason, [string]$Url, $Task, [string]$LogPath, [long]$LogOffset) {
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add("[$((Get-Date).ToString('o'))] $Reason")
    $lines.Add("启动检查地址：$Url")
    if ($Task) {
        try {
            $state = Get-ScheduledTask -TaskName $Task.TaskName -TaskPath $Task.TaskPath
            $info = Get-ScheduledTaskInfo -TaskName $Task.TaskName -TaskPath $Task.TaskPath
            $lines.Add("后台任务：$($Task.TaskName)；状态：$($state.State)；结果：$($info.LastTaskResult)；最近启动：$($info.LastRunTime)")
            $lines.Add("运行环境：$($state.Actions.Execute -join ', ')")
        } catch { $lines.Add("无法读取后台任务状态：$($_.Exception.Message)") }
    } else { $lines.Add('启动方式：原目录 Node 后台进程') }
    $lines.Add('本次启动日志（最多最后 16 KB）：')
    try { $lines.Add((Get-FuStartupLog $LogPath $LogOffset)) } catch { $lines.Add("日志无法读取：$($_.Exception.Message)") }
    [IO.File]::WriteAllLines($Report, $lines, [Text.UTF8Encoding]::new($true))
}

function Invoke-FuServiceControl([string]$Root, [ValidateSet('Start', 'Stop')][string]$Action) {
    $Root = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $launch = Join-Path $Root 'launch.mjs'
    $app = Join-Path $Root 'app'
    $task = Get-ScheduledTask -TaskName 'FabulaUltima' -TaskPath '\' -ErrorAction SilentlyContinue
    if ($task -and (Get-FuTaskRoot $task) -ne $Root) {
        throw '后台任务属于另一个 FU 目录。请在正在使用的安装文件夹运行 start.bat 或 stop.bat。'
    }
    if ($Action -eq 'Stop') {
        # Disable first, so a retry or startup trigger cannot restart it while stopping.
        if ($task) { Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath | Out-Null }
        Stop-FuDeployment $task $launch $app
        Write-Host 'FU 已停止。世界数据保留，开机自启已暂停。' -ForegroundColor Green
        Write-Host '需要继续使用时，双击本目录的 start.bat；它会恢复后台运行和开机自启。'
        return
    }
    if (-not $task) { throw '尚未安装后台任务。首次安装请运行 install.bat；已有配置请运行 deploy-windows.cmd。' }
    $config = Read-FuConfig (Join-Path $Root '.env')
    $version = (Get-Content -LiteralPath (Join-Path $app 'build-info.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
    $url = Get-FuHealthUrl $config
    $logPath = Join-Path $Root 'logs/server.log'
    $offset = if (Test-Path -LiteralPath $logPath) { (Get-Item -LiteralPath $logPath).Length } else { 0 }
    Enable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath | Out-Null
    if ($task.State -ne 'Running') { Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath }
    $health = Wait-FuHealth $url $version
    if (-not $health.Healthy) {
        $report = Join-Path $Root 'startup-report.txt'
        Write-FuStartupReport $report $health.Detail $url $task $logPath $offset
        throw "后台启动检查未通过：$($health.Detail)。详细原因已写入 $report"
    }
    Write-Host 'FU 已在后台运行，开机自启已恢复。可以关闭此窗口。' -ForegroundColor Green
    Write-Host "玩家入口：$($config['FU_PUBLIC_URL'])$($config['FU_BASE_PATH'])/"
}
