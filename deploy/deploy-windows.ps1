param([switch]$FreshInstall)
$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    . (Join-Path $PSScriptRoot 'windows-common.ps1')
    . (Join-Path $PSScriptRoot 'upgrade-support.ps1')
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw '请关闭此窗口，右键 deploy-windows.cmd，选择“以管理员身份运行”。'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'app/server.mjs'))) { throw '请先完整解压部署包，再运行此文件。' }
    if ($FreshInstall) { Assert-FuFreshDirectory $PSScriptRoot }
    $taskName = 'FabulaUltima'
    $launch = Join-Path $PSScriptRoot 'launch.mjs'
    $existing = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
    $previousRoot = Get-FuTaskRoot $existing -AllowMissingFiles:$FreshInstall
    if ($previousRoot -and $previousRoot -ne $PSScriptRoot -and -not $FreshInstall) {
        throw '已有另一个目录的 FU 后台任务。保留世界请使用升级包；重新建立空世界请在新文件夹运行 install.bat。'
    }
    $configPath = Join-Path $PSScriptRoot '.env'
    $config = Read-FuConfig $configPath
    Write-Host ''
    Write-Host '最终物语 · Windows 服务器部署' -ForegroundColor Cyan
    if ($FreshInstall) {
        Write-Host "全新安装到：$PSScriptRoot。账号、世界和素材从空白开始。"
        if ($previousRoot) { Write-Host "将接管原 FU 后台任务：$previousRoot。原文件夹不再作为当前服务使用。" }
        if ($previousRoot -and -not (Test-Path -LiteralPath (Join-Path $previousRoot 'app/build-info.json') -PathType Leaf)) {
            Write-Host '已根据原安装记录确认这是 FU 残留任务；旧程序文件缺失不影响本次全新安装。'
        }
    }
    Write-Host '1. 用公网 IP / 域名和端口直接访问（HTTP）'
    Write-Host '2. 接入已有网站（例如已有 HTTPS 域名，仍需配置网站转发）'
    $defaultMode = if ($config['FU_HOST'] -eq '127.0.0.1') { '2' } else { '1' }
    $choice = Read-Host "部署方式 [$defaultMode]"
    if (-not $choice) { $choice = $defaultMode }
    if ($choice -notin @('1', '2')) { throw '请选择 1 或 2。' }
    $mode = if ($choice -eq '1') { 'direct' } else { 'proxy' }
    $defaultPort = if ($config['FU_PORT']) { $config['FU_PORT'] } else { '3340' }
    $portText = Read-Host "FU 服务端口 [$defaultPort]"
    if (-not $portText) { $portText = $defaultPort }
    $port = 0
    if (-not [int]::TryParse($portText, [ref]$port)) { throw '端口必须是数字，例如 3340。' }
    Write-Host '公网 IP 请从云服务器控制台复制；本机网卡地址可能是内网地址，不能自动当作公网 IP。'
    $address = Read-Host "公网 IP 或完整网站地址 [$($config['FU_PUBLIC_URL'])]"
    if (-not $address) { $address = $config['FU_PUBLIC_URL'] }
    if (-not $address) { throw '请填写玩家将访问的公网 IP 或网站地址。' }
    $origin = Get-FuEndpoint $address $port $mode
    if ($config['FU_BASE_PATH'] -and $config['FU_BASE_PATH'] -ne '/fu') {
        throw '已有自定义入口，请保留原配置并使用 start.cmd；本向导不会覆盖自定义入口。'
    }
    foreach ($setting in @(@('FU_DATA_DIR', 'data'), @('FU_PUBLIC_DIR', 'app/public'))) {
        if (-not $config[$setting[0]]) { continue }
        $configured = $config[$setting[0]]
        if (-not [IO.Path]::IsPathRooted($configured)) { $configured = Join-Path $PSScriptRoot $configured }
        if ([IO.Path]::GetFullPath($configured).TrimEnd('\', '/') -ne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $setting[1])).TrimEnd('\', '/')) {
            throw '已有自定义数据或网页目录，请保留原配置并使用 start.cmd；本向导不会更改外部目录权限。'
        }
    }
    $dataDirectory = Get-Item -LiteralPath (Join-Path $PSScriptRoot 'data') -ErrorAction SilentlyContinue
    if ($dataDirectory -and ($dataDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'data 是链接目录，请保留原配置并使用 start.cmd；本向导不会更改链接目标权限。'
    }
    $ruleName = 'FabulaUltima-Server'
    $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($rule -and $rule.Description -ne $PSScriptRoot -and
        -not ($FreshInstall -and $previousRoot -and $rule.Description -eq $previousRoot)) {
        throw 'FU 防火墙规则与已确认的安装目录不一致，未修改它。'
    }
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
        $ownedIds = @(Get-FuOwnedProcesses $launch (Join-Path $PSScriptRoot 'app') | ForEach-Object { $_.ProcessId })
        if ($previousRoot -and $previousRoot -ne $PSScriptRoot) {
            $ownedIds += @(Get-FuOwnedProcesses (Join-Path $previousRoot 'launch.mjs') (Join-Path $previousRoot 'app') | ForEach-Object { $_.ProcessId })
        }
        $owned = -not @($listeners | Where-Object { $_.OwningProcess -notin $ownedIds }).Count
        if (-not $owned) { throw "端口 $port 已被占用。请关闭本目录之前打开的 start.cmd，或重新运行并换一个端口；不会停止其他程序。" }
    }
    $node = Install-FuRuntime $PSScriptRoot $previousRoot
    if ($existing) {
        Disable-ScheduledTask -TaskName $taskName -TaskPath '\' | Out-Null
        Stop-FuDeployment $existing (Join-Path $previousRoot 'launch.mjs') (Join-Path $previousRoot 'app')
    }
    Stop-FuDeployment $null $launch (Join-Path $PSScriptRoot 'app')
    $values = [ordered]@{
        FU_HOST = $(if ($mode -eq 'direct') { '0.0.0.0' } else { '127.0.0.1' })
        FU_PORT = "$port"
        FU_BASE_PATH = '/fu'
        FU_PUBLIC_URL = $origin
        FU_DATA_DIR = (Join-Path $PSScriptRoot 'data')
        FU_UPDATE_REPO = $(if ($config['FU_UPDATE_REPO']) { $config['FU_UPDATE_REPO'] } else { 'nubeslove/fabula-table' })
        FU_AUTO_UPDATE = $(if ($config.ContainsKey('FU_AUTO_UPDATE')) { $config['FU_AUTO_UPDATE'] } else { '1' })
    }
    if (-not $config['FU_CREATE_KEY']) {
        $values.FU_CREATE_KEY = & $node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))"
        if ($LASTEXITCODE -ne 0) { throw '建房钥匙生成失败。' }
    }
    if (-not $config['FU_ADMIN_KEY']) {
        $values.FU_ADMIN_KEY = & $node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))"
        if ($LASTEXITCODE -ne 0) { throw '管理密码生成失败。' }
    }
    Write-FuConfig $configPath $values
    foreach ($folder in @('data', 'logs', 'updates')) {
        $path = Join-Path $PSScriptRoot $folder
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Grant-FuServiceAccess $path 'Modify' $true
    }
    Grant-FuServiceAccess $PSScriptRoot 'ReadAndExecute' $true
    Grant-FuServiceAccess (Join-Path $PSScriptRoot 'app') 'Modify' $true
    Grant-FuServiceAccess $configPath 'Read' $false
    $permissionsBackup = Join-Path $PSScriptRoot ('service-path-acl-before-' + [guid]::NewGuid().ToString('N') + '.json')
    Grant-FuServicePathAccess $PSScriptRoot $permissionsBackup
    $action = New-ScheduledTaskAction -Execute $node -Argument "`"$launch`" --background" -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $account = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Principal $account -Settings $settings -Description "FU 独立站：$PSScriptRoot" -Force | Out-Null
    if ($rule) { Remove-NetFirewallRule -Name $ruleName }
    if ($mode -eq 'direct') {
        New-NetFirewallRule -Name $ruleName -DisplayName "最终物语 FU TCP $port" -Description $PSScriptRoot -Direction Inbound -Protocol TCP -LocalPort $port -Program $node -Action Allow -Profile Any | Out-Null
    }
    Enable-ScheduledTask -TaskName $taskName -TaskPath '\' | Out-Null
    Invoke-FuServiceControl $PSScriptRoot Start
    Write-Host ''
    Write-Host "FU 已在后台启动：$origin/fu/" -ForegroundColor Green
    Write-Host '开机自动启动；关闭本窗口或退出远程桌面后仍可运行。'
    Write-Host '建房钥匙：用记事本打开本目录的 .env，复制 FU_CREATE_KEY 等号后面的内容。'
    Write-Host '网页更新：大厅中打开“服务器管理”，输入 .env 中 FU_ADMIN_KEY 的值。此密码只交给服务器管理者。'
    if ($mode -eq 'direct') {
        Write-Host "Windows 防火墙已允许本程序的 TCP $port。请在云服务器控制台的安全组 / 云防火墙中允许入站 TCP $port。"
        Write-Host '上述检查只确认服务器本机启动成功；公网连通性请用另一台电脑访问所示地址验证。'
    } else {
        Write-Host "请把已有网站的 /fu/ 转发到 http://127.0.0.1:$port，保留 /fu 路径；nginx-fu.conf 提供示例。"
    }
    Write-Host '停止服务：双击 stop.bat。恢复运行和开机自启：双击 start.bat。'
} catch {
    Write-Host "部署未完成：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
