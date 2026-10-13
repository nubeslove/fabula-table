param([string]$TargetDirectory, [switch]$NoRestart)
$ErrorActionPreference = 'Stop'
$backup = $null
$task = $null
$wasRunning = $false
$stopRequested = $false
$appMoved = $false
$copied = @()
$startupAttempted = $false
$logOffset = 0
function Assert-Child([string]$Path, [string]$Root) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "路径不在指定目录内：$resolved" }
    return $resolved
}
try {
    . (Join-Path $PSScriptRoot 'windows-common.ps1')
    . (Join-Path $PSScriptRoot 'upgrade-support.ps1')
    Write-Host '最终物语 · 保留世界升级' -ForegroundColor Cyan
    Write-Host '请把升级包解压到独立文件夹。本程序会备份原程序、配置和全部世界数据，然后替换程序与官方规则。'
    if (-not $TargetDirectory) { $TargetDirectory = Read-Host '原 FU 部署目录（里面应有 app、data 和 .env）' }
    $target = [IO.Path]::GetFullPath($TargetDirectory.Trim().Trim('"')).TrimEnd('\', '/')
    if ($target -eq [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')) { throw '升级包和旧部署不能是同一目录；请重新解压到其他文件夹再运行。' }
    if (-not (Test-Path -LiteralPath (Join-Path $target 'app/server.mjs'))) { throw '所选目录不是已有 FU 部署，未修改任何世界。' }
    if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '部署目录是链接，请选择其实际目录。' }
    $build = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'app/build-info.json') -Raw | ConvertFrom-Json
    $old = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $target 'app/build-info.json') -Raw | ConvertFrom-Json
    if ($build.product -ne 'fabula-table' -or $old.product -ne 'fabula-table') { throw '程序标识不匹配，无法升级。' }
    if ([version]$old.version -gt [version]$build.version) { throw '此包比已部署版本更旧，不会降级。' }
    $manifest = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
    $rootFiles = @('install.bat','start.bat','stop.bat','manage-windows.ps1','upgrade-support.ps1','update-runner.mjs','start.cmd','start-windows.ps1','windows-common.ps1','deploy-windows.cmd','deploy-windows.ps1','launch.mjs','start.sh','deploy.sh','nginx-fu.conf','使用说明.md')
    foreach ($entry in $manifest) {
        if (-not ($entry.file.StartsWith('app/') -or $rootFiles -contains $entry.file -or $entry.file -in @('upgrade-windows.cmd','upgrade-windows.ps1','upgrade-support.ps1','升级说明.md'))) { throw '升级清单包含非程序文件，拒绝覆盖。' }
        $sourceFile = Assert-Child (Join-Path $PSScriptRoot $entry.file) $PSScriptRoot
        if ((Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "升级包文件校验失败：$($entry.file)" }
    }
    $config = Read-FuConfig (Join-Path $target '.env')
    $healthUrl = Get-FuHealthUrl $config
    $serverLog = Join-Path $target 'logs/server.log'
    $data = if ($config['FU_DATA_DIR']) { $config['FU_DATA_DIR'] } else { 'data' }
    if (-not [IO.Path]::IsPathRooted($data)) { $data = Join-Path $target $data }
    $data = [IO.Path]::GetFullPath($data)
    if ($data.TrimEnd('\') -eq [IO.Path]::GetPathRoot($data).TrimEnd('\')) { throw '数据目录指向磁盘根目录，请先纠正配置。' }
    if ($data.TrimEnd('\', '/') -eq $target -or $target.StartsWith($data.TrimEnd('\', '/') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '数据目录包含整个部署目录，无法在内部安全备份。请先将数据目录独立配置。' }
    $expectedPublic = [IO.Path]::GetFullPath((Join-Path $target 'app/public'))
    if ($config['FU_PUBLIC_DIR']) {
        $public = $config['FU_PUBLIC_DIR']; if (-not [IO.Path]::IsPathRooted($public)) { $public = Join-Path $target $public }
        if ([IO.Path]::GetFullPath($public) -ne $expectedPublic) { throw '已有自定义网页目录，请先按升级说明确认官方资源部署位置；未修改现有程序。' }
    }
    $app = Assert-Child (Join-Path $target 'app') $target
    if ($data -eq $app -or $data.StartsWith($app + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '数据目录位于程序 app 内，请先将数据独立存放再升级，未修改现有程序。' }
    foreach ($folder in @($app, $data)) {
        if (Test-Path -LiteralPath $folder) {
            if ((Get-Item -LiteralPath $folder).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "目录为链接，无法安全备份：$folder" }
            if (Get-ChildItem -LiteralPath $folder -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1) { throw "目录内有链接，无法完整备份：$folder" }
        }
    }
    $launch = Join-Path $target 'launch.mjs'
    if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
        $task = Get-ScheduledTask -TaskName 'FabulaUltima' -TaskPath '\' -ErrorAction SilentlyContinue
        if ($task -and -not ($task.Actions.Arguments -contains "`"$launch`" --background")) { throw '后台任务属于另一个部署目录；请选择任务实际使用的目录。' }
        if ($task) {
            $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
            if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw '请右键 upgrade-windows.cmd，选择“以管理员身份运行”，以停止并重新启动原 FU 后台任务。' }
        }
    }
    $owned = @(Get-FuOwnedProcesses $launch $app)
    if ($NoRestart -and ($owned.Count -gt 0 -or ($task -and $task.State -eq 'Running'))) { throw '离线升级要求先停止这个 FU 服务。' }
    $wasRunning = $owned.Count -gt 0 -or ($task -and $task.State -eq 'Running')
    $node = Find-FuNode $target
    if (-not $node) { throw '原部署中没有可用的 Node.js 22 或更新版本；请先修复原运行环境。' }
    if (-not $NoRestart) {
        Write-Host '正在停止原 FU 服务，等待后台任务和进程完全退出……'
        $stopRequested = $true
        Stop-FuDeployment $task $launch $app
    }
    $stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6)
    $backup = Assert-Child (Join-Path $target "backups/before-$($build.version)-$stamp") $target
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    $report = Join-Path $backup 'upgrade-report.txt'
    Write-Host "正在备份：$backup"
    if (Test-Path -LiteralPath $data) { Copy-Item -LiteralPath $data -Destination (Join-Path $backup 'data') -Recurse }
    if (Test-Path -LiteralPath (Join-Path $target '.env')) { Copy-Item -LiteralPath (Join-Path $target '.env') -Destination (Join-Path $backup '.env') }
    foreach ($file in $rootFiles) {
        if (Test-Path -LiteralPath (Join-Path $target $file)) { Copy-Item -LiteralPath (Join-Path $target $file) -Destination (Join-Path $backup $file) }
    }
    @{ from=$old.version; to=$build.version; dataDirectory=$data; target=$target; at=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'upgrade.json') -Encoding UTF8
    if ($task) {
        Write-Host '正在修复后台账户解析安装路径所需的父目录权限……'
        Grant-FuServicePathAccess $target (Join-Path $backup 'service-path-acl-before.json')
    }
    $stage = Assert-Child (Join-Path $target ".fu-update-$stamp") $target
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app') -Destination $stage -Recurse
    $backupApp = Assert-Child (Join-Path $backup 'app') $target
    Move-Item -LiteralPath $app -Destination $backupApp
    $appMoved = $true
    Move-Item -LiteralPath $stage -Destination $app
    foreach ($file in $rootFiles) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $target $file) -Force
        $copied += $file
    }
    if ($task) { Grant-FuServiceAccess $app 'ReadAndExecute' $true }
    if (-not $NoRestart) {
        if (Test-Path -LiteralPath $serverLog -PathType Leaf) { $logOffset = (Get-Item -LiteralPath $serverLog).Length }
        $startupAttempted = $true
        Write-Host '正在启动新版，最多等待 60 秒；窗口会保留具体检查结果。'
        if ($task) { Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath }
        else { Start-Process -FilePath $node -ArgumentList "`"$launch`" --background" -WorkingDirectory $target -WindowStyle Hidden | Out-Null }
        $health = Wait-FuHealth $healthUrl $build.version
        if (-not $health.Healthy) { throw "新版启动检查失败：$($health.Detail)" }
    }
    Write-Host "已升级 $($old.version) → $($build.version)。世界、人物、素材、账号密钥、.env 和 runtime 均保留。" -ForegroundColor Green
    Write-Host "完整升级前备份：$backup"
    Write-Host '浏览器刷新后注册统一账号，用原世界名字和口令认领身份。旧 GM 仍是 GM，原人物归属不变。'
    if ($NoRestart) { Write-Host '离线升级完成；请按原方式启动服务。' }
} catch {
    $message = $_.Exception.Message
    if ($startupAttempted -and $report) {
        try {
            Write-FuStartupReport $report $message $healthUrl $task $serverLog $logOffset
            Write-Host "本次失败详情已保存：$report" -ForegroundColor Yellow
            Write-Host (Get-FuStartupLog $serverLog $logOffset)
        } catch { Write-Host "失败详情无法保存：$($_.Exception.Message)" -ForegroundColor Yellow }
    }
    if ($appMoved -and $backup) {
        try {
            Stop-FuDeployment $task $launch $app
            if (Test-Path -LiteralPath $app) { $failed = Assert-Child (Join-Path $backup 'failed-app') $target; Move-Item -LiteralPath $app -Destination $failed }
            $restore = Assert-Child (Join-Path $backup 'app') $target
            Move-Item -LiteralPath $restore -Destination $app
            foreach ($file in $copied) { if (Test-Path -LiteralPath (Join-Path $backup $file)) { Copy-Item -LiteralPath (Join-Path $backup $file) -Destination (Join-Path $target $file) -Force } }
            Write-Host '已恢复原程序文件，原世界数据未被覆盖。' -ForegroundColor Yellow
            if ($wasRunning) {
                if ($task) { Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath }
                else { Start-Process -FilePath $node -ArgumentList "`"$launch`" --background" -WorkingDirectory $target -WindowStyle Hidden | Out-Null }
                Write-Host '正在确认旧版恢复运行……'
                $restored = Wait-FuHealth $healthUrl $old.version
                if (-not $restored.Healthy) { throw "原程序文件已恢复，但旧版启动未通过检查：$($restored.Detail)；请查看 logs/server.log。" }
                $recovery = "已确认旧版 $($old.version) 恢复运行，仍使用原访问地址。"
                Write-Host $recovery -ForegroundColor Yellow
                if ($report) { Add-Content -LiteralPath $report -Value $recovery -Encoding UTF8 }
            }
        } catch {
            $recovery = "自动恢复未完成，请使用备份：$backup。原因：$($_.Exception.Message)"
            Write-Host $recovery -ForegroundColor Red
            if ($report) { Add-Content -LiteralPath $report -Value $recovery -Encoding UTF8 -ErrorAction SilentlyContinue }
        }
    } elseif ($stopRequested -and $wasRunning -and $task) { Start-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue }
    elseif ($stopRequested -and $wasRunning -and $node -and $launch) { Start-Process -FilePath $node -ArgumentList "`"$launch`" --background" -WorkingDirectory $target -WindowStyle Hidden | Out-Null }
    Write-Host "升级未完成：$message" -ForegroundColor Red
    exit 1
}
