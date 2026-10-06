#!/usr/bin/env bash
# audit.sh - a hint, not a grader.
# It looks at the live cluster (kubectl only, no jq) and shows which of the 16
# concepts it can see. The evidence you write in K8S-AUDIT.md is what counts.
# Usage: ./audit.sh [namespace]      REPO=/path/to/your/repo ./audit.sh
# Add your own tooling namespaces to SYS if they show up as "your app".
# Never exits non-zero because something is missing.

NS="${1:-}"; REPO="${REPO:-.}"
SYS='kube-system|kube-public|kube-node-lease|local-path-storage|ingress-nginx|metallb-system|cert-manager|kubernetes-dashboard|monitoring|argocd|envoy-gateway-system'
SC=(-A); [ -n "$NS" ] && SC=(-n "$NS")

kubectl get nodes >/dev/null 2>&1 || { echo "kubectl cannot reach a cluster. Is your kind cluster up?"; exit 0; }
echo "context: $(kubectl config current-context)   scope: ${NS:-all non-system namespaces}"
echo

# q <kind> <jsonpath fields>: one row per object, namespace first, system namespaces dropped
q() { kubectl get "$1" "${SC[@]}" -o jsonpath="{range .items[*]}{.metadata.namespace}{\"\t\"}$2{\"\n\"}{end}" 2>/dev/null |
  awk -F'\t' -v s="^($SYS)\$" '$1 !~ s'; }
cnt() { if [ -n "$1" ]; then printf '%s\n' "$1" | wc -l | tr -d ' '; else echo 0; fi; }
# containers <fields> <regex> [init]: prints "total good" for pods. Fields look like name:a/b/c, good matches the regex.
# Pass a third argument to count init containers too (they cannot have probes, but should have limits).
containers() { local r='{range .spec.containers[*]}{.name}:'"$1"'{" "}{end}'
  [ -n "$3" ] && r='{range .spec.initContainers[*]}{.name}:'"$1"'{" "}{end}'"$r"
  q pods "{.metadata.name}{\"\t\"}$r" |
  awk -F'\t' -v re="$2" '{n=split($3,c," "); for(j=1;j<=n;j++){t++; if(c[j]~re)g++}} END{print t+0, g+0}'; }

i=0; pass=0; must=0
show() { # name ok(0/1) reason
  i=$((i+1)); local mark="❌"
  if [ "$2" = 0 ]; then mark="✅"; pass=$((pass+1)); [ $i -le 12 ] && must=$((must+1)); fi
  printf '%s %-36s %s\n' "$mark" "$1" "$3"
}
ok() { [ "$1" -ge "${2:-1}" ] && echo 0 || echo 1; }

n=$(kubectl get ns -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | grep -Evx "default|$SYS" | grep -cx "${NS:-.*}")
d=$(cnt "$(q deploy '{.metadata.name}')")
s=$(cnt "$(q svc '{.metadata.name}' | awk -F'\t' '$2!="kubernetes"')")
e=$(cnt "$(q endpointslices '{.metadata.labels.kubernetes\.io/service-name}{"\t"}{.endpoints[*].addresses[*]}' | awk -F'\t' '$3!="" && $2!="kubernetes" {print $1"/"$2}' | sort -u)")
r=$(cnt "$(q rs '{.metadata.ownerReferences[0].name}{"\t"}{.spec.template.spec.containers[*].image}' | sort -u | awk -F'\t' '{c[$1"/"$2]++} END{for(k in c) if(c[k]>1) print k}')")
cm=$(cnt "$(q cm '{.metadata.name}' | awk -F'\t' '$2!="kube-root-ca.crt"')")
sec=$(cnt "$(q secret '{.metadata.name}{"\t"}{.type}' | awk -F'\t' '$3=="Opaque"')")
read -r rt rg <<< "$(containers '{.resources.requests.cpu}/{.resources.requests.memory}/{.resources.limits.cpu}/{.resources.limits.memory}' '^[^:]+:[^/]+/[^/]+/[^/]+/[^/]+$' init)"
read -r pt pg <<< "$(containers '{.livenessProbe.periodSeconds}/{.readinessProbe.periodSeconds}' ':[0-9]+/[0-9]+$')"
pvc=$(cnt "$(q pvc '{.metadata.name}{"\t"}{.status.phase}' | awk -F'\t' '$3=="Bound"')")
ing=$(cnt "$(q ingress '{.metadata.name}')")
ctl=$(kubectl get pods -A -l 'app.kubernetes.io/name in (ingress-nginx,traefik,haproxy-ingress,contour)' --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
nodes=$(kubectl get nodes --no-headers | wc -l | tr -d ' ')
hpa=$(cnt "$(q hpa '{.metadata.name}')")
rb=$(( $(cnt "$(q role '{.metadata.name}')") + $(cnt "$(q rolebinding '{.metadata.name}')") ))
sa=$(cnt "$(q sa '{.metadata.name}' | awk -F'\t' '$2!="default"')")
cj=$(cnt "$(q cronjob '{.metadata.name}')")
gha=1; grep -rEqs 'kind create cluster|helm/kind-action|setup-kind' "$REPO/.github/workflows" && gha=0

show "Deployment + ReplicaSet"   "$(ok "$d")"   "$d deployment(s) in app namespaces"
show "Service"                   "$(ok "$s")"   "$s service(s)"
show "Namespace"                 "$(ok "$n")"   "$n namespace(s) besides default and system ones"
show "Labels and selectors"      "$(ok "$e")"   "$e service(s) have endpoints, so selectors match pod labels"
show "Rolling update + rollback" "$(ok "$r")"   "$r deployment(s) rolled to a new image (rollback itself is not visible, show it in your evidence)"
show "ConfigMap"                 "$(ok "$cm")"  "$cm non-default configmap(s)"
show "Secret"                    "$(ok "$sec")" "$sec Opaque secret(s)"
show "Requests and limits"       "$([ "${rt:-0}" -gt 0 ] && [ "$rt" = "$rg" ] && echo 0 || echo 1)" "${rg:-0} of ${rt:-0} containers have cpu+memory requests and limits"
show "Probes (liveness+readiness)" "$(ok "${pg:-0}")" "${pg:-0} of ${pt:-0} containers have both probes"
show "PVC"                       "$(ok "$pvc")" "$pvc bound PVC(s)"
show "Ingress"                   "$([ "$ing" -ge 1 ] && [ "$ctl" -ge 1 ] && echo 0 || echo 1)" "$ing ingress resource(s), $ctl running controller pod(s)"
show "Multi-node cluster"        "$(ok "$nodes" 3)" "$nodes node(s)"
show "HPA (stretch)"             "$(ok "$hpa")" "$hpa HPA(s)"
show "RBAC + ServiceAccount (stretch)" "$([ "$rb" -ge 1 ] && [ "$sa" -ge 1 ] && echo 0 || echo 1)" "$rb role/rolebinding(s), $sa custom serviceaccount(s)"
show "CronJob (stretch)"         "$(ok "$cj")"  "$cj cronjob(s)"
show "GitHub Actions to kind (stretch)" "$gha"  "looks for kind create cluster / helm/kind-action in $REPO/.github/workflows"
echo
bad=$(q pods '{.metadata.name}{"\t"}{.status.phase}{"\t"}{range .status.containerStatuses[*]}{.ready}{" "}{end}' | awk -F'\t' '$3!="Succeeded" && ($3!="Running" || $4~/false/) {print $2}')
if [ -n "$bad" ]; then
  echo "⚠️  $(cnt "$bad") pod(s) not Running/Ready: $(echo "$bad" | head -5 | tr '\n' ' ')"
  echo "   The app is not fully working, so the ✅ above only show that objects exist. Fix the pods first."
fi
echo "Seen: $pass/16  (must $must/12, stretch $((pass-must))/4). Pass mark is 10+. Now write the evidence in K8S-AUDIT.md."
exit 0
