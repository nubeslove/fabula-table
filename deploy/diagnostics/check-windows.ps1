param([string]$TargetDirectory)
$ErrorActionPreference = 'Stop'
$created = $false
$report = Join-Path $PSScriptRoot '后台启动诊断.txt'
$taskName = 'FabulaUltima-Diagnostic-' + [guid]::NewGuid().ToString('N')
function Record([string]$Text) { Add-Content -LiteralPath $report -Value $Text -Encoding UTF8 }
try {
    [IO.File]::WriteAllText($report, "最终物语 · 后台启动诊断 v1`r`n", [Text.UTF8Encoding]::new($true))
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw '请右键 check-windows.cmd，选择“以管理员身份运行”。需要创建一次性诊断任务，以原后台账户检查权限。'
    }
    Write-Host '最终物语 · 后台启动诊断' -ForegroundColor Cyan
    Write-Host '旧 FU 服务保持运行。本工具检查启动权限，完成后移除临时诊断任务。'
    if (-not $TargetDirectory) { $TargetDirectory = Read-Host '服务器上的原 FU 部署目录（包含 app、data、.env）' }
    $target = [IO.Path]::GetFullPath($TargetDirectory.Trim().Trim('"')).TrimEnd('\', '/')
    if (-not (Test-Path -LiteralPath (Join-Path $target 'app/server.mjs') -PathType Leaf)) { throw '所选目录缺少 app/server.mjs。' }
    $existing = Get-ScheduledTask -TaskName 'FabulaUltima' -TaskPath '\' -ErrorAction Stop
    $launch = Join-Path $target 'launch.mjs'
    if ($existing.Actions.Count -ne 1 -or $existing.Actions.Arguments -ne "`"$launch`" --background") { throw '原后台任务并不使用这个目录的标准启动入口。未修改任务，请把本报告交给维护者。' }
    $node = $existing.Actions.Execute
    if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or [IO.Path]::GetFileName($node) -ne 'node.exe') { throw '任务中配置的 Node 路径不可用。' }
    $info = Get-ScheduledTaskInfo -TaskName 'FabulaUltima' -TaskPath '\'
    Record "部署目录：$target"
    Record "原任务状态：$($existing.State)；最近结果：$($info.LastTaskResult)"
    Record "原任务身份：$($existing.Principal.UserId)；登录方式：$($existing.Principal.LogonType)"
    Record "原任务入口：$node $($existing.Actions.Arguments)"
    Record "原任务工作目录：$($existing.Actions.WorkingDirectory)"
    $accountId = $existing.Principal.UserId
    if ($accountId -match '^S-1-') { $sid = [Security.Principal.SecurityIdentifier]::new($accountId) }
    else { $sid = [Security.Principal.NTAccount]::new($accountId).Translate([Security.Principal.SecurityIdentifier]) }
    if ($sid.Value -notin @('S-1-5-18','S-1-5-19','S-1-5-20')) { throw '原任务使用自定义用户，无法无密码复现该身份。请将本报告交给维护者。' }

    # Only the fresh, dedicated diagnostics directory gets a service-account ACL.
    $container = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'FabulaUltimaDiagnostics'))
    if ((Test-Path -LiteralPath $container) -and ((Get-Item -LiteralPath $container).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '诊断目录是链接，已停止。' }
    $probe = Join-Path $container $taskName
    New-Item -ItemType Directory -Path $probe | Out-Null
    foreach ($file in @('service-probe.ps1','service-probe.mjs')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $probe $file)
    }
    @{node=$node;target=$target} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $probe 'probe.json') -Encoding UTF8
    $acl = Get-Acl -LiteralPath $probe
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'Modify', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $probe -AclObject $acl
    $powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $argsText = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $probe 'service-probe.ps1')`" -ProbeDirectory `"$probe`""
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $argsText -WorkingDirectory $probe
    $account = New-ScheduledTaskPrincipal -UserId $sid.Value -LogonType ServiceAccount -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Principal $account -Settings $settings | Out-Null
    $created = $true
    Start-ScheduledTask -TaskName $taskName -TaskPath '\'
    Write-Host '正在以原后台账户检查，通常十秒内完成……'
    $watch = [Diagnostics.Stopwatch]::StartNew()
    do {
        if (Test-Path -LiteralPath (Join-Path $probe 'completed.txt')) { break }
        Start-Sleep -Milliseconds 500
    } while ($watch.Elapsed.TotalSeconds -lt 45)
    $check = Get-ScheduledTask -TaskName $taskName -TaskPath '\'
    $checkInfo = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
    Record "诊断任务状态：$($check.State)；运行结果：$($checkInfo.LastTaskResult)"
    $serviceReport = Join-Path $probe 'service-report.txt'
    if (Test-Path -LiteralPath $serviceReport) { Record (Get-Content -LiteralPath $serviceReport -Raw -Encoding UTF8) }
    else { Record '诊断账户连 PowerShell 检查入口也未能执行；需结合上方任务结果判断。' }
    Record "原 FU 服务未启停，原配置和程序未替换。诊断过程目录：$probe"
} catch {
    Record "诊断未完成：$($_.Exception.Message)"
    Write-Host "诊断未完成：$($_.Exception.Message)" -ForegroundColor Yellow
} finally {
    if ($created) {
        Stop-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -TaskPath '\' -Confirm:$false -ErrorAction SilentlyContinue
    }
    Write-Host "报告已保存：$report" -ForegroundColor Cyan
    Write-Host '请把“后台启动诊断.txt”发给维护者。无需发送 .env 或世界数据。'
}
