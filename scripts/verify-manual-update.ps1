# Isolated integration check: only generated output fixtures are upgraded.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$source = Join-Path $project 'deploy/update.bat'
$text = [IO.File]::ReadAllText($source, [Text.Encoding]::UTF8)
$payload = ($text -split '(?m)^# POWERSHELL-BEGIN\r?$',2)[1]
$tokens=$null; $errors=$null
[Management.Automation.Language.Parser]::ParseInput($payload, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { throw ($errors | Out-String) }
. ([scriptblock]::Create(($payload -split '(?m)^# ENTRYPOINT\r?$',2)[0]))
$fixture = Join-Path $project ('output/manual-update-qa-' + [guid]::NewGuid().ToString('N'))
$target = Join-Path $fixture "install 中文 ' test"
New-Item -ItemType Directory -Path $fixture | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'release/fabula-table-0.3.0') -Destination $target -Recurse
New-Item -ItemType Directory -Path (Join-Path $target 'data'), (Join-Path $target 'runtime') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $target 'data/keep.txt'), 'world-player-asset-sentinel')
[IO.File]::WriteAllText((Join-Path $target 'runtime/keep.txt'), 'runtime-sentinel')
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start(); $port=$listener.LocalEndpoint.Port; $listener.Stop()
[IO.File]::WriteAllText((Join-Path $target '.env'), "FU_HOST=127.0.0.1`nFU_PORT=$port`nFU_BASE_PATH=`nFU_AUTO_UPDATE=0`n")
$originalEnv = (Get-FileHash -LiteralPath (Join-Path $target '.env')).Hash
$script:localZip = Join-Path $project 'release/fabula-table-upgrade-0.3.3.zip'
$script:hash = (Get-FileHash -LiteralPath $script:localZip -Algorithm SHA256).Hash.ToLowerInvariant()
$script:badHash = $true
function Invoke-RestMethod {
    [pscustomobject]@{draft=$false;prerelease=$false;tag_name='v0.3.3';assets=@([pscustomobject]@{
        name='fabula-table-upgrade-0.3.3.zip'; size=(Get-Item -LiteralPath $script:localZip).Length;
        digest=('sha256:' + $(if ($script:badHash) { '0' * 64 } else { $script:hash }));
        browser_download_url='https://github.com/nubeslove/fabula-table/releases/download/v0.3.3/fabula-table-upgrade-0.3.3.zip'
    })}
}
function Invoke-WebRequest { param($OutFile); Copy-Item -LiteralPath $script:localZip -Destination $OutFile }
try {
    $rejected=$false
    try { Invoke-FuLatestUpdate $target } catch { $rejected=$_.Exception.Message.Contains('校验失败') }
    if (-not $rejected) { throw 'Hash mismatch was not rejected' }
    if ((Get-Content -LiteralPath (Join-Path $target 'app/build-info.json') -Raw | ConvertFrom-Json).version -ne '0.3.0') { throw 'Failed download changed program' }
    if (Test-Path -LiteralPath (Join-Path $target 'backups')) { throw 'Failed download reached replacement stage' }
    $script:badHash=$false
    Invoke-FuLatestUpdate $target
    if ((Get-Content -LiteralPath (Join-Path $target 'app/build-info.json') -Raw | ConvertFrom-Json).version -ne '0.3.3') { throw 'Version did not change' }
    if ((Get-FileHash -LiteralPath (Join-Path $target '.env')).Hash -ne $originalEnv) { throw 'Configuration changed' }
    if ([IO.File]::ReadAllText((Join-Path $target 'data/keep.txt')) -ne 'world-player-asset-sentinel') { throw 'Data changed' }
    if ([IO.File]::ReadAllText((Join-Path $target 'runtime/keep.txt')) -ne 'runtime-sentinel') { throw 'Runtime changed' }
    if (Test-Path -LiteralPath (Join-Path $target 'updates/maintenance')) { throw 'Maintenance lock leaked' }
    if (@(Get-ChildItem -LiteralPath (Join-Path $target 'backups') -Directory).Count -ne 1) { throw 'Backup missing' }
    Invoke-FuLatestUpdate $target
    if (@(Get-ChildItem -LiteralPath (Join-Path $target 'backups') -Directory).Count -ne 1) { throw 'Already-current update made another backup' }
    Write-Host 'PASS: checksum rejection; actual 0.3.0 to 0.3.3 upgrade and health; backup; data/config/runtime preserved; same-version no-op; Chinese, space and apostrophe path.' -ForegroundColor Green
} finally {
    . (Join-Path $project 'deploy/upgrade-support.ps1')
    Stop-FuDeployment $null (Join-Path $target 'launch.mjs') (Join-Path $target 'app')
    Write-Host "Isolated evidence: $fixture"
}
