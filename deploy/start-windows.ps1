$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    . (Join-Path $PSScriptRoot 'windows-common.ps1')
    $node = Find-FuNode $PSScriptRoot
    if (-not $node) {
        Write-Host '没有找到 Node.js 22 或更新版本。'
        Write-Host 'Windows 服务器：请右键以管理员身份运行 deploy-windows.cmd，它会准备官方免安装运行环境。'
        Write-Host '本机试用：也可从 https://nodejs.org/en/download 安装 Node.js LTS 后重新打开本窗口。'
        exit 1
    }
    & $node (Join-Path $PSScriptRoot 'launch.mjs')
    exit $LASTEXITCODE
} catch {
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
