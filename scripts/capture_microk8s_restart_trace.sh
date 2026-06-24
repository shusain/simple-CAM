#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-shaun@192.168.0.11}"
CAPTURE_SECONDS="${CAPTURE_SECONDS:-180}"
OUTPUT_DIR="${OUTPUT_DIR:-./logs}"

mkdir -p "$OUTPUT_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
log_file="${OUTPUT_DIR}/microk8s-restart-trace-${timestamp}.log"

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}

trap cleanup EXIT INT TERM

run_stream() {
  local name="$1"
  local cmd="$2"

  ssh -o BatchMode=yes "$REMOTE_HOST" "$cmd" \
    | sed -u "s/^/[$name] /" \
    >> "$log_file" 2>&1 &

  pids+=("$!")
}

run_retrying_kubectl_stream() {
  local name="$1"
  local kubectl_args="$2"
  local remote_cmd="
while true; do
  sudo microk8s kubectl ${kubectl_args} 2>&1 || true
  echo '__STREAM_RETRY__'
  sleep 2
done
"

  ssh -o BatchMode=yes "$REMOTE_HOST" "$remote_cmd" \
    | sed -u "s/^/[$name] /" \
    >> "$log_file" 2>&1 &

  pids+=("$!")
}

{
  echo "# MicroK8s restart trace"
  echo "# started_at=$(date --iso-8601=seconds)"
  echo "# remote_host=$REMOTE_HOST"
  echo "# capture_seconds=$CAPTURE_SECONDS"
  echo
} > "$log_file"

run_stream "kubelite" "sudo journalctl -fu snap.microk8s.daemon-kubelite -n 0 --no-pager"
run_stream "dqlite" "sudo journalctl -fu snap.microk8s.daemon-k8s-dqlite -n 0 --no-pager"
run_retrying_kubectl_stream "nodes" "get nodes -w -o wide"
run_retrying_kubectl_stream "events" "get events -A -w"
run_retrying_kubectl_stream "pods" "get pods -A -w -o wide"

sleep 3

{
  echo
  echo "[local] triggering restart at $(date --iso-8601=seconds)"
} >> "$log_file"

ssh -o BatchMode=yes "$REMOTE_HOST" "sudo microk8s stop && sudo microk8s start" >> "$log_file" 2>&1

{
  echo
  echo "[local] waiting ${CAPTURE_SECONDS}s for post-restart traces"
} >> "$log_file"

sleep "$CAPTURE_SECONDS"

{
  echo
  echo "[local] final readiness snapshot at $(date --iso-8601=seconds)"
} >> "$log_file"

ssh -o BatchMode=yes "$REMOTE_HOST" "sudo microk8s status --wait-ready && sudo microk8s kubectl get nodes -o wide && sudo microk8s kubectl get pods -A -o wide" >> "$log_file" 2>&1

cleanup

echo "Wrote trace to $log_file"
