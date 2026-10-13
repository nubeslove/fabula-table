$ErrorActionPreference = 'Stop'

function Find-FuNode([string]$Root) {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    $candidates = @(
        (Join-Path $Root 'runtime/node.exe'),
        "$env:ProgramFiles/nodejs/node.exe",
        "$env:ProgramW6432/nodejs/node.exe"
    )
    if ($command) { $candidates += $command.Source }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $version = & $candidate --version 2>$null
        if ($LASTEXITCODE -eq 0 -and "$version" -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Install-FuRuntime([string]$Root, [string]$ReuseRoot) {
    $runtime = Join-Path $Root 'runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $target = Join-Path $runtime 'node.exe'
    $installed = Find-FuNode $Root
    if (-not $installed -and $ReuseRoot) { $installed = Find-FuNode $ReuseRoot }
    if ($installed) {
        if ($installed -ne $target) {
            Copy-Item -LiteralPath $installed -Destination $target -Force
            $license = Join-Path (Split-Path $installed) 'LICENSE'
            if (Test-Path -LiteralPath $license) { Copy-Item -LiteralPath $license -Destination $runtime -Force }
        }
        return $target
    }
    if (-not [Environment]::Is64BitOperatingSystem) { throw '自动运行环境支持 64 位 Windows。请使用 64 位服务器。' }
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    Write-Host '未找到 Node.js 22+，正在从 nodejs.org 下载官方 Node.js 24 LTS 免安装环境。'
    Write-Host '运行环境仅下载到服务器的 runtime 目录，玩家不需要下载它。'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $origin = 'https://nodejs.org/dist/latest-v24.x/'
    $manifest = (Invoke-WebRequest -UseBasicParsing -Uri ($origin + 'SHASUMS256.txt') -TimeoutSec 30).Content
    $match = [regex]::Match($manifest, "(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-$arch\.zip)\s*$")
    if (-not $match.Success) { throw '无法确认官方 Windows 运行环境文件，请在 https://nodejs.org/en/download 安装 LTS 后重试。' }
    $filename = $match.Groups[2].Value
    $zip = Join-Path $runtime $filename
    Invoke-WebRequest -UseBasicParsing -Uri ($origin + $filename) -OutFile $zip -TimeoutSec 600
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $match.Groups[1].Value) {
        throw 'Node.js 下载校验失败；文件未执行。请检查网络后重试。'
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
        $folder = $filename.Substring(0, $filename.Length - 4)
        foreach ($name in @('node.exe', 'LICENSE')) {
            $entry = $archive.GetEntry("$folder/$name")
            if (-not $entry) { throw "官方压缩包中缺少 $name" }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $runtime $name), $true)
        }
    } finally { $archive.Dispose() }
    Remove-Item -LiteralPath $zip
    if (-not (Find-FuNode $Root)) { throw 'Node.js 无法运行。请确认服务器系统支持当前 Node.js LTS。' }
    return $target
}

function Read-FuConfig([string]$Path) {
    $values = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in [IO.File]::ReadAllLines($Path)) {
            if ($line -match '^\s*(FU_[A-Z0-9_]+)\s*=\s*(.*?)\s*$') {
                $values[$Matches[1]] = $Matches[2].Trim([char[]]@('"', "'"))
            }
        }
    }
    return $values
}

function Write-FuConfig([string]$Path, [System.Collections.IDictionary]$Values) {
    $lines = [Collections.Generic.List[string]]::new()
    $written = @{}
    if (Test-Path -LiteralPath $Path) {
        Copy-Item -LiteralPath $Path -Destination "$Path.backup" -Force
        foreach ($line in [IO.File]::ReadAllLines($Path)) {
            if ($line -match '^\s*(FU_[A-Z0-9_]+)\s*=' -and $Values.Contains($Matches[1])) {
                $key = $Matches[1]
                if (-not $written[$key]) { $lines.Add("$key=$($Values[$key])"); $written[$key] = $true }
            } else { $lines.Add($line) }
        }
    }
    foreach ($key in $Values.Keys) {
        if (-not $written[$key]) { $lines.Add("$key=$($Values[$key])") }
    }
    [IO.File]::WriteAllLines($Path, $lines, [Text.UTF8Encoding]::new($false))
}

function Get-FuEndpoint([string]$Address, [int]$Port, [string]$Mode) {
    if ($Port -lt 1024 -or $Port -gt 65535) { throw '端口请输入 1024 至 65535 之间的整数，例如 3340。' }
    $text = $Address.Trim()
    if ($text -notmatch '^https?://') { $text = "http://$text" }
    $uri = $null
    if (-not [Uri]::TryCreate($text, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -notin @('http', 'https') -or -not $uri.Host -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
        $uri.Host -in @('0.0.0.0', '::', '[::]')) {
        throw '请填写有效的公网 IP 或网站地址，不要填写账号、密码或 0.0.0.0。'
    }
    if ($uri.AbsolutePath -notin @('/', '/fu', '/fu/')) { throw '访问地址请只填 IP 或域名；本向导统一使用 /fu/ 入口。' }
    if ($Mode -eq 'direct') {
        if ($uri.Scheme -eq 'https') { throw 'IP 直连使用 http。已有 HTTPS 网站请选择“接入已有网站”。' }
        $builder = [UriBuilder]::new($uri)
        $builder.Port = $Port
        return $builder.Uri.GetLeftPart([UriPartial]::Authority)
    }
    if ($Mode -ne 'proxy') { throw '未知部署方式。' }
    return $uri.GetLeftPart([UriPartial]::Authority)
}

function Grant-FuServiceAccess([string]$Path, [string]$Rights, [bool]$Directory) {
    $sid = [Security.Principal.SecurityIdentifier]::new('S-1-5-19') # Local Service
    $inherit = if ($Directory) { 'ContainerInherit, ObjectInherit' } else { 'None' }
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, $Rights, $inherit, 'None', 'Allow')
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Grant-FuDirectoryMetadataAccess([string]$Path, [string]$AccountSid = 'S-1-5-19') {
    # Node resolves every ancestor using lstat. File read permissions alone are insufficient.
    # Apply to this directory only: no listing, file read, write, or inheritance rights.
    $sid = [Security.Principal.SecurityIdentifier]::new($AccountSid)
    $rights = [Security.AccessControl.FileSystemRights]'ReadAttributes, Traverse'
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, $rights, 'None', 'None', 'Allow')
    $acl = [IO.Directory]::GetAccessControl($Path)
    $section = [Security.AccessControl.AccessControlSections]::Access
    $before = $acl.GetSecurityDescriptorSddlForm($section)
    $acl.AddAccessRule($rule)
    if ($acl.GetSecurityDescriptorSddlForm($section) -ne $before) {
        [IO.Directory]::SetAccessControl($Path, $acl)
    }
}

function Grant-FuServicePathAccess([string]$Root, [string]$BackupFile) {
    $ancestors = [Collections.Generic.List[object]]::new()
    $directory = [IO.Directory]::GetParent([IO.Path]::GetFullPath($Root).TrimEnd('\', '/'))
    while ($directory) {
        $acl = [IO.Directory]::GetAccessControl($directory.FullName)
        $ancestors.Add([pscustomobject]@{
            path = $directory.FullName
            dacl = $acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
        })
        $directory = $directory.Parent
    }
    # Keep the original DACLs before any repair; do not silently overwrite an earlier snapshot.
    $json = ConvertTo-Json -InputObject @($ancestors.ToArray()) -Depth 4
    $stream = [IO.File]::Open($BackupFile, 'CreateNew', 'Write', 'Read')
    $writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($true))
    try { $writer.Write($json) } finally { $writer.Dispose() }
    foreach ($ancestor in $ancestors) { Grant-FuDirectoryMetadataAccess $ancestor.path }
    Write-Host '已补齐后台账户的父目录属性读取与路径通过权限（仅目录本身）。'
}
