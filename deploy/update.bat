@echo off
setlocal
set "FU_UPDATE_SELF=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:FU_UPDATE_SELF,[Text.Encoding]::UTF8); & ([scriptblock]::Create(($s -split '(?m)^# POWERSHELL-BEGIN\r?$',2)[1]))"
set "FU_UPDATE_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %FU_UPDATE_EXIT%
# POWERSHELL-BEGIN
$ErrorActionPreference = 'Stop'

function Invoke-FuLatestUpdate([string]$Root) {
    $Root = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $info = Join-Path $Root 'app/build-info.json'
    if (-not (Test-Path -LiteralPath $info -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $Root '.env') -PathType Leaf)) {
        throw '请把 update.bat 放在已有 FU 安装根目录（与 app、data、.env 同级），再双击运行。'
    }
    $old = Get-Content -LiteralPath $info -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($old.product -ne 'fabula-table') { throw '当前目录不是最终物语安装目录，未修改文件。' }
    $lock = $null; $transcript = $false; $maintenanceOwned = $false; $taskWasDisabled = $false; $success = $false
    $maintenance = Join-Path $Root 'updates/maintenance'
    $marker = 'manual-' + [guid]::NewGuid().ToString('N')
    try {
        $lock = [IO.File]::Open((Join-Path $Root '.fu-manual-update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
        $stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6)
        $logs = Join-Path $Root 'logs'
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        $log = Join-Path $logs "manual-update-$stamp.log"
        Start-Transcript -LiteralPath $log -Force | Out-Null
        $transcript = $true
        Write-Host "最终物语 · 自动下载并升级（当前 $($old.version)）" -ForegroundColor Cyan
        Write-Host "安装目录：$Root"
        Write-Host '升级期间会断开世界连接；世界、账号、素材和配置会保留。'
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        $headers = @{ 'User-Agent'='FabulaUltima-Windows-Updater'; 'Accept'='application/vnd.github+json' }
        Write-Host '正在检查 GitHub 正式版本……'
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/nubeslove/fabula-table/releases/latest' -Headers $headers -TimeoutSec 30
        if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v(\d+\.\d+\.\d+)$') { throw '发行版本无效，未停止原服务。' }
        $version = $Matches[1]
        if ([version]$version -le [version]$old.version) {
            Write-Host "当前 $($old.version) 已是最新版本，不需要替换。" -ForegroundColor Green
            return
        }
        $assets = @($release.assets | Where-Object { $_.name -ceq "fabula-table-upgrade-$version.zip" })
        if ($assets.Count -ne 1) { throw '最新正式版缺少唯一的 Windows 升级包。' }
        $asset = $assets[0]
        $expectedUrl = "https://github.com/nubeslove/fabula-table/releases/download/v$version/fabula-table-upgrade-$version.zip"
        if ($asset.browser_download_url -cne $expectedUrl -or $asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { throw '升级包来源或校验值无效，未停止原服务。' }
        $digest = $Matches[1].ToLowerInvariant()
        $stage = Join-Path $Root ".fu-downloads/$stamp"
        New-Item -ItemType Directory -Path $stage -Force | Out-Null
        $zip = Join-Path $stage 'upgrade.zip'
        Write-Host "正在下载 $version（约 $([math]::Round($asset.size / 1MB, 1)) MB）……"
        Invoke-WebRequest -UseBasicParsing -Uri $expectedUrl -OutFile $zip -Headers @{ 'User-Agent'='FabulaUltima-Windows-Updater' } -TimeoutSec 600
        if ((Get-Item -LiteralPath $zip).Length -ne $asset.size -or (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) { throw '下载文件校验失败，未停止原服务。请重新运行。' }
        $unpacked = Join-Path $stage 'package'
        New-Item -ItemType Directory -Path $unpacked -Force | Out-Null
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead($zip)
        try {
            $prefix = [IO.Path]::GetFullPath($unpacked).TrimEnd('\') + '\'
            foreach ($entry in $archive.Entries) {
                $destination = [IO.Path]::GetFullPath((Join-Path $unpacked $entry.FullName))
                if (-not $destination.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or $entry.FullName.Contains(':')) { throw '升级包包含非法路径。' }
            }
        } finally { $archive.Dispose() }
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $unpacked)
        $build = Get-Content -LiteralPath (Join-Path $unpacked 'app/build-info.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($build.product -ne 'fabula-table' -or $build.version -ne $version) { throw '升级包程序标识或版本不匹配。' }
        $upgrade = Join-Path $unpacked 'upgrade-windows.ps1'
        if (-not (Test-Path -LiteralPath $upgrade -PathType Leaf)) { throw '升级包缺少 Windows 升级入口。' }
        # Helpers come only from the SHA256-verified official release archive.
        . (Join-Path $unpacked 'windows-common.ps1')
        . (Join-Path $unpacked 'upgrade-support.ps1')
        $task = Get-ScheduledTask -TaskName 'FabulaUltima' -TaskPath '\' -ErrorAction SilentlyContinue
        if ($task -and (Get-FuTaskRoot $task) -ne $Root) { throw 'FU 后台任务属于另一个目录，请把此 BAT 放到该任务的实际安装目录。' }
        $updates = Join-Path $Root 'updates'
        New-Item -ItemType Directory -Path $updates -Force | Out-Null
        foreach ($file in @('maintenance','request.json','transaction.json')) {
            if (Test-Path -LiteralPath (Join-Path $updates $file)) { throw "另一个更新尚未结束（updates/$file），本次未停止服务。请保留此日志以便排查。" }
        }
        $guard = [IO.File]::Open($maintenance, 'CreateNew', 'Write', 'None')
        try { $content = [Text.Encoding]::UTF8.GetBytes($marker); $guard.Write($content, 0, $content.Length) } finally { $guard.Dispose() }
        $maintenanceOwned = $true
        if ($task -and $task.State -eq 'Disabled') {
            Enable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath | Out-Null
            $taskWasDisabled = $true
        }
        Write-Host '下载校验完成。正在备份、停止 FU、替换程序并重新启动……' -ForegroundColor Cyan
        $powershell = Join-Path $PSHOME 'powershell.exe'
        & $powershell -NoProfile -ExecutionPolicy Bypass -File $upgrade -TargetDirectory $Root
        if ($LASTEXITCODE -ne 0) { throw "升级未完成（退出码 $LASTEXITCODE）。请查看上方回退结果与 logs 中的本次日志。" }
        $installed = Get-Content -LiteralPath $info -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($installed.version -ne $version) { throw '升级入口返回成功，但安装版本不匹配。请保留日志。' }
        $success = $true
        $state = @{ phase='complete'; version=$version; message="手动升级至 $version 完成，世界、账号和素材已保留。"; at=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
        [IO.File]::WriteAllText((Join-Path $updates 'state.json'), $state, [Text.UTF8Encoding]::new($false))
        Write-Host "已升级至 $version，服务已启动。请回到浏览器按 Ctrl+F5 刷新。" -ForegroundColor Green
        Write-Host "升级前备份在：$(Join-Path $Root 'backups')"
    } catch {
        Write-Host "更新错误：$($_.Exception.Message)" -ForegroundColor Red
        throw
    } finally {
        if ($taskWasDisabled -and -not $success) { Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue | Out-Null }
        if ($maintenanceOwned -and (Test-Path -LiteralPath $maintenance) -and [IO.File]::ReadAllText($maintenance) -eq $marker) { Remove-Item -LiteralPath $maintenance }
        if ($transcript) { Write-Host "本次日志：$log"; Stop-Transcript | Out-Null }
        if ($lock) { $lock.Dispose() }
    }
}

# ENTRYPOINT
try {
    $self = [IO.Path]::GetFullPath($env:FU_UPDATE_SELF)
    $root = Split-Path -Parent $self
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host '需要管理员权限来停止并重启 FU，请在 Windows 提示中选择“是”。'
        $escaped = $self.Replace("'", "''")
        $command = "`$env:FU_UPDATE_ELEVATED='1'; `$env:FU_UPDATE_SELF='$escaped'; `$s=[IO.File]::ReadAllText(`$env:FU_UPDATE_SELF,[Text.Encoding]::UTF8); & ([scriptblock]::Create((`$s -split '(?m)^# POWERSHELL-BEGIN\r?$',2)[1])); Read-Host 'Press Enter to close'"
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
        $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded) -Verb RunAs -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw '更新窗口返回失败，请查看安装目录 logs 中的 manual-update 日志。' }
    } else {
        Invoke-FuLatestUpdate $root
    }
} catch {
    Write-Host "更新未完成：$($_.Exception.Message)" -ForegroundColor Red
    if ($env:FU_UPDATE_ELEVATED -eq '1') { Read-Host 'Press Enter to close' | Out-Null }
    exit 1
}
