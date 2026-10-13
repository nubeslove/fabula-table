param([Parameter(Mandatory=$true)][string]$ProbeDirectory)
$ErrorActionPreference = 'Stop'
$report = Join-Path $ProbeDirectory 'service-report.txt'
$done = Join-Path $ProbeDirectory 'completed.txt'
function Write-ProbeLine([string]$Text) { Add-Content -LiteralPath $report -Value $Text -Encoding UTF8 }
try {
    $config = Get-Content -LiteralPath (Join-Path $ProbeDirectory 'probe.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-ProbeLine "检查时间：$((Get-Date).ToString('o'))"
    Write-ProbeLine "实际运行身份：$([Security.Principal.WindowsIdentity]::GetCurrent().Name)"
    Write-ProbeLine "Node 路径：$($config.node)"
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $config.node
    $start.Arguments = '"' + (Join-Path $ProbeDirectory 'service-probe.mjs') + '" "' + $config.target + '"'
    $start.WorkingDirectory = $ProbeDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::UTF8
    $start.StandardErrorEncoding = [Text.Encoding]::UTF8
    $child = [Diagnostics.Process]::Start($start)
    $stdout = $child.StandardOutput.ReadToEndAsync()
    $stderr = $child.StandardError.ReadToEndAsync()
    if (-not $child.WaitForExit(30000)) { $child.Kill(); throw 'Node 诊断进程超时，已停止本次诊断进程。' }
    Write-ProbeLine "诊断进程退出码：$($child.ExitCode)"
    Write-ProbeLine $stdout.Result
    Write-ProbeLine $stderr.Result
    $child.Dispose()
} catch {
    Write-ProbeLine "启动诊断进程失败：$($_.Exception.GetBaseException().Message)"
} finally {
    [IO.File]::WriteAllText($done, 'completed', [Text.UTF8Encoding]::new($false))
}
