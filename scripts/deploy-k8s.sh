#!/bin/sh
set -eu

namespace="automation"
deployment="simple-cam"
container="simple-cam"
image="registry.shaun-husain.com/simple-cam:latest"
selector="app=simple-cam"

retry_kubectl() {
  attempt=1
  while [ "$attempt" -le 12 ]; do
    if kubectl --request-timeout=10s "$@"; then
      return 0
    fi
    echo "kubectl command failed; retrying ($attempt/12)..." >&2
    sleep 5
    attempt=$((attempt + 1))
  done
  return 1
}

retry_kubectl get namespace "$namespace" >/dev/null 2>&1 || retry_kubectl create namespace "$namespace"
node="$(retry_kubectl get nodes -o jsonpath='{.items[0].metadata.name}')"
retry_kubectl wait --for=condition=Ready "node/$node" --timeout=30s
retry_kubectl apply -f k8s/

old_pods="$(kubectl --request-timeout=10s get pods -n "$namespace" -l "$selector" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null || true)"
retry_kubectl rollout restart "deployment/$deployment" -n "$namespace"

ready=0
deadline=$(($(date +%s) + 180))
while [ "$(date +%s)" -lt "$deadline" ]; do
  state="$(kubectl --request-timeout=10s get deployment "$deployment" -n "$namespace" \
    -o jsonpath='{.metadata.generation} {.status.observedGeneration} {.spec.replicas} {.status.updatedReplicas} {.status.availableReplicas} {.status.unavailableReplicas}' 2>/dev/null || true)"
  read -r generation observed desired updated available unavailable <<EOF
$state
EOF
  unavailable="${unavailable:-0}"

  new_ready=0
  pods="$(kubectl --request-timeout=10s get pods -n "$namespace" -l "$selector" \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.phase}{" "}{range .status.conditions[?(@.type=="Ready")]}{.status}{end}{"\n"}{end}' 2>/dev/null || true)"
  while read -r pod phase pod_ready; do
    [ -n "${pod:-}" ] || continue
    if [ "$phase" = "Running" ] && [ "$pod_ready" = "True" ] && ! printf '%s\n' "$old_pods" | grep -Fxq "$pod"; then
      new_ready=1
      break
    fi
  done <<EOF
$pods
EOF

  if [ -n "${generation:-}" ] && [ "$generation" = "$observed" ] && [ "$desired" -gt 0 ] && \
     [ "$updated" = "$desired" ] && [ "$available" = "$desired" ] && \
     [ "$unavailable" = "0" ] && [ "$new_ready" -eq 1 ]; then
    ready=1
    break
  fi

  sleep 5
done

if [ "$ready" -ne 1 ]; then
  echo "Deployment did not become ready within 180 seconds" >&2
  kubectl --request-timeout=10s get node -o wide || true
  kubectl --request-timeout=10s get deployment "$deployment" -n "$namespace" -o wide || true
  kubectl --request-timeout=10s get replicasets -n "$namespace" -l "$selector" -o wide || true
  kubectl --request-timeout=10s get pods -n "$namespace" -l "$selector" -o wide || true
  kubectl --request-timeout=10s describe pods -n "$namespace" -l "$selector" || true
  kubectl --request-timeout=10s get events -n "$namespace" --sort-by=.lastTimestamp | tail -120 || true
  exit 1
fi

deployed_image="$(kubectl --request-timeout=10s get deployment "$deployment" -n "$namespace" -o jsonpath="{.spec.template.spec.containers[?(@.name=='$container')].image}")"
if [ "$deployed_image" != "$image" ]; then
  echo "Expected deployment image $image but found $deployed_image" >&2
  exit 1
fi

kubectl --request-timeout=10s get deployment "$deployment" -n "$namespace" -o wide
kubectl --request-timeout=10s get pods,service,ingress -n "$namespace" -l "$selector" -o wide

