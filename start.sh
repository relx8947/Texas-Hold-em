#!/usr/bin/env bash
# 后台启动 Texas Hold'em 服务（Go 后端，内置前端静态文件）
# 用法:
#   ./start.sh            启动服务
#   ./start.sh stop       停止服务
#   ./start.sh restart    重启服务
#   ./start.sh status     查看状态

set -euo pipefail

# 项目根目录（脚本所在目录）
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="${ROOT_DIR}/server"
LOG_DIR="${ROOT_DIR}/logs"
PID_FILE="${ROOT_DIR}/run/server.pid"
BIN_FILE="${ROOT_DIR}/run/texas-holdem-lan"
LOG_FILE="${LOG_DIR}/server.log"

# 可通过环境变量覆盖，默认值与 server/config.go 保持一致
export ADDR="${ADDR:-:18080}"
export DATA_PATH="${DATA_PATH:-${ROOT_DIR}/run/data.db}"
export STATIC_DIR="${STATIC_DIR:-${ROOT_DIR}/web-ui/dist}"

mkdir -p "${LOG_DIR}" "${ROOT_DIR}/run"

is_running() {
  [[ -f "${PID_FILE}" ]] || return 1
  local pid
  pid="$(cat "${PID_FILE}")"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

start() {
  if is_running; then
    echo "服务已在运行 (PID $(cat "${PID_FILE}"))"
    exit 0
  fi

  echo "构建后端二进制..."
  (cd "${SERVER_DIR}" && go build -o "${BIN_FILE}" .)

  echo "后台启动服务..."
  nohup "${BIN_FILE}" >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"

  sleep 1
  if is_running; then
    # 将监听地址(如 :18080 或 0.0.0.0:18080)转换为可访问的网页地址
    local port="${ADDR##*:}"
    local host_ip
    host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -z "${host_ip}" ]] && host_ip="localhost"
    echo "启动成功 (PID $(cat "${PID_FILE}"))"
    echo "监听地址: ${ADDR}"
    echo "网页地址: http://${host_ip}:${port}"
    echo "日志文件: ${LOG_FILE}"
  else
    echo "启动失败，请查看日志: ${LOG_FILE}"
    exit 1
  fi
}

stop() {
  if ! is_running; then
    echo "服务未运行"
    rm -f "${PID_FILE}"
    return 0
  fi
  local pid
  pid="$(cat "${PID_FILE}")"
  echo "停止服务 (PID ${pid})..."
  kill "${pid}"
  rm -f "${PID_FILE}"
  echo "已停止"
}

status() {
  if is_running; then
    echo "运行中 (PID $(cat "${PID_FILE}"))"
  else
    echo "未运行"
  fi
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; start ;;
  status)  status ;;
  *) echo "用法: $0 {start|stop|restart|status}"; exit 1 ;;
esac
