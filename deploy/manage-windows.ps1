param(
    [Parameter(Mandatory = $true)][ValidateSet('Install', 'Start', 'Stop')][string]$Action,
    [switch]$Elevated
)
$ErrorActionPreference = 'Stop'
$result = 0
try {
    Set-Location -LiteralPath $PSScriptRoot
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        if ($Elevated) { throw '未取得管理员权限，请右键 BAT 文件，选择“以管理员身份运行”。' }
        Write-Host '请在 Windows 弹出的管理员权限窗口中选择“是”。'
        $shell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
        # The elevated window is interactive: installation asks for the address and port.
        $child = Start-Process -FilePath $shell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Action', $Action, '-Elevated') -Verb RunAs -WindowStyle Normal -Wait -PassThru
        exit $child.ExitCode
    }
    if ($Action -eq 'Install') {
        $global:LASTEXITCODE = 0
        & (Join-Path $PSScriptRoot 'deploy-windows.ps1') -FreshInstall
        $result = $LASTEXITCODE
    } else {
        . (Join-Path $PSScriptRoot 'windows-common.ps1')
        . (Join-Path $PSScriptRoot 'upgrade-support.ps1')
        Invoke-FuServiceControl $PSScriptRoot $Action
    }
} catch {
    Write-Host "操作未完成：$($_.Exception.Message)" -ForegroundColor Red
    $result = 1
}
if ($Elevated) { Read-Host '按回车关闭此窗口' | Out-Null }
exit $result
