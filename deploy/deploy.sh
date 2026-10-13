#!/usr/bin/env bash
# Install only the independent FU service. Existing AAF services and web config are untouched.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [ "$(id -u)" -ne 0 ]; then echo '请运行 sudo bash deploy.sh 安装 FU 独立服务；不使用系统服务时可运行 bash start.sh。'; exit 1; fi
if ! command -v node >/dev/null 2>&1; then echo '没有找到 Node.js。请先安装 Node.js 20+，再运行本脚本。'; exit 1; fi
node -e "if(Number(process.versions.node.split('.')[0])<20) process.exit(1)" || { echo 'Node.js 版本必须至少为 20'; exit 1; }
command -v systemctl >/dev/null || { echo '此脚本适用于 systemd Linux；其他系统请使用 start.sh。'; exit 1; }
if [[ "$PWD" =~ [[:space:]] ]]; then echo '请把部署包放在不含空格的路径，例如 /opt/fabula-table。'; exit 1; fi
if [ ! -f .env ]; then
  umask 077
  node --input-type=module -e "import{randomBytes}from'node:crypto';import{writeFileSync}from'node:fs';writeFileSync('.env','FU_HOST=127.0.0.1\nFU_PORT=3340\nFU_BASE_PATH=/fu\nFU_CREATE_KEY='+randomBytes(18).toString('base64url')+'\n');"
  echo '已生成独立配置 .env。GM 创建房间时使用其中的 FU_CREATE_KEY。'
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo '未检测到 FFmpeg：图片仍可压缩；音视频请先使用 WebM/MP4 或 MP3/Ogg。'
  echo '需要自动压缩音视频时，安装系统的 ffmpeg 包后重启 fabula-table 服务。'
fi
if [ -e /etc/systemd/system/fabula-table.service ] && ! grep -Fq "WorkingDirectory=$PWD" /etc/systemd/system/fabula-table.service; then
  echo '已有另一处 FU 服务，请在原部署目录更新；停止安装以保护原世界。'; exit 1
fi
mkdir -p data
if ! id fabula-table >/dev/null 2>&1; then useradd --system --no-create-home --shell /usr/sbin/nologin fabula-table; fi
case "$(realpath data)" in "$PWD"/data) ;; *) echo 'data 必须位于当前部署目录中，不能链接到其他位置。'; exit 1 ;; esac
chown -R fabula-table:fabula-table data
chgrp fabula-table .env
chmod 640 .env
cat > /etc/systemd/system/fabula-table.service <<EOF
[Unit]
Description=Fabula Ultima independent story table
After=network.target
[Service]
Type=simple
User=fabula-table
Group=fabula-table
WorkingDirectory=$PWD
ExecStart=/bin/bash $PWD/start.sh
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now fabula-table
systemctl restart fabula-table
echo 'FU 独立服务已启动。查看状态：systemctl status fabula-table'
echo '将 nginx-fu.conf 的 location 段放入现有站点的 server 段。它不会修改共坠群星入口。'
echo '完成 HTTPS 接入后，在 .env 设置 FU_PUBLIC_URL=https://你的域名，再重启 FU。'
echo '完整备份：保留整个 data 目录与 .env；更新时只替换 app、scripts 和说明文件。'
