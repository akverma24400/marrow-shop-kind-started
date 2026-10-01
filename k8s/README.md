# Morrow Shop — Kubernetes Deployment on KIND

A hands-on Kubernetes deployment of a three-tier e-commerce application using **KIND (Kubernetes IN Docker)**. This project brings together containerized frontend and backend services, PostgreSQL, service discovery, configuration management, and persistent storage.

This guide covers the Kubernetes setup. For the application overview, local development, and API examples, see the existing [basic setup README](../README.md).

## Application Demo

**Demo video: coming soon.**

The walkthrough will show the storefront loading products, searching or filtering the catalog, adding items to the cart, and placing a demo order stored in PostgreSQL. Checkout does not collect payments.

<!-- EMBEDDED VIDEO PLACEHOLDER
To display a playable video directly in this README on GitHub:
1. Open kind/README.md on GitHub and click the pencil icon to edit it.
2. Remove the “Demo video: coming soon.” line above.
3. Drag your MP4 recording from your computer onto a blank line below
   “Application Demo”, OUTSIDE this HTML comment.
4. Wait for the upload to finish. GitHub inserts an attachment URL automatically.
   Keep that URL by itself on a line, with blank lines around it. Do not wrap it
   in [Watch demo](...), a code block, or an HTML comment.
5. Open Preview to check the video player, then commit the README change.

The attachment URL is how GitHub stores the video reference in Markdown;
readers see a video player in the rendered README. No separately hosted video
URL is needed. Simply linking to a repository MP4 file is not this embed method.

Use MP4 with H.264 for broad browser compatibility. Video upload limits are
10 MB for repositories on a free GitHub plan and 100 MB on a paid plan.
Reference: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files

Suggested recording: show the running Pods, open the storefront, browse products,
add an item to the cart, place an order using demo details, and show the saved
order in PostgreSQL. Include a persistence test only if you actually perform it.
END EMBEDDED VIDEO PLACEHOLDER -->

## What I Implemented

- A three-node KIND cluster: one control-plane node and two worker nodes.
- An isolated `marrow-ns` namespace for application resources.
- Frontend and backend Deployments with two replicas each.
- A NodePort Service for the frontend and an internal ClusterIP Service for the backend.
- A PostgreSQL StatefulSet with one replica and a headless Service.
- A ConfigMap for application settings and a Secret reference for the database password.
- A PersistentVolume and a StatefulSet-generated PersistentVolumeClaim for PostgreSQL.
- A SQL initialization ConfigMap for creating tables and seeding products.
- CPU and memory requests/limits for frontend and backend containers.
- A PostgreSQL readiness probe using `pg_isready`.

## Architecture

| Component | Technology / resource | Role |
| --- | --- | --- |
| Frontend | Vanilla JavaScript, Vite; `frontend-deployment` | Storefront, cart, checkout, and `/api` proxy |
| Backend | Node.js, Express; `backend-deployment` | Product API and transactional order creation |
| Database | PostgreSQL 17 Alpine; `postgres` StatefulSet | Products, orders, and order items |
| Configuration | `marrow-configmap`, `marrow-secrets` | Database settings and password reference |
| Storage | `postgres-pv`, `pgdata-postgres-0` PVC | PostgreSQL data directory |

The browser sends requests to the frontend. Its Vite preview server proxies `/api` to `http://backend-service:5000`. The backend connects to PostgreSQL through `postgres:5432` inside the same namespace.

The frontend image includes `vite.config.js`; Vite preview inherits the configured server proxy. This deployment uses Vite preview for practice. A production deployment would use a suitable static web server or ingress for routing.

## Repository Files

This README belongs in **`kind/README.md`**. All shell commands below run from the **repository root**, unless stated otherwise.

| File | Purpose |
| --- | --- |
| `kind/kind-config.yml` | Three-node cluster and host port mapping |
| `k8s/01-namespace.yml` | Application namespace |
| `k8s/02-frontend-pod.yml` | Standalone Pod exercise; not needed for the Deployment setup |
| `k8s/03-frontend-deployment.yml` | Two frontend replicas and API proxy target |
| `k8s/04-frontend-service.yml` | Frontend NodePort Service |
| `k8s/05-backend-deployment.yml` | Two backend replicas and environment references |
| `k8s/06-secrets.yml` | Database password Secret |
| `k8s/07-configmap.yml` | Application and PostgreSQL configuration |
| `k8s/08-backend-service.yml` | Internal backend Service |
| `k8s/09-postgres.yml` | StatefulSet, initialization mount, probe, and PVC template |
| `k8s/10-postgres-service.yml` | PostgreSQL headless Service |
| `k8s/11-postgres-pv.yml` | Static hostPath PersistentVolume |
| `k8s/12-postgres-init.yml` | Schema and product seed SQL |

## Prerequisites

- Docker installed and running.
- KIND, `kubectl`, and Git installed.
- Access to the container images referenced in the manifests.

```bash
docker info
kind version
kubectl version --client
```

The manifests reference these application images:

```text
akash24400/marrow-shop-kind-started-frontend:latest
akash24400/marrow-shop-kind-started-backend:latest
```

## Deploy on KIND

### 1. Get the repository and create the cluster

```bash
git clone https://github.com/akverma24400/marrow-shop-kind-started.git
cd marrow-shop-kind-started

kind create cluster --config kind/kind-config.yml
kubectl config use-context kind-marrow-shop
kubectl get nodes
```

The checked-in configuration names the cluster `marrow-shop` and specifies `kindest/node:v1.36.1`. Use a node image supported by your installed KIND version if cluster creation reports a compatibility or image error. If the cluster already exists, skip creation and select its context.

### 2. Apply configuration and storage

For a fresh deployment, set your own practice database password in the Secret manifest before applying it. Do not commit real credentials. Both PostgreSQL and the backend read the `POSTGRES_PASSWORD` key from `marrow-secrets`.

```bash
kubectl apply -f k8s/01-namespace.yml
kubectl apply -f k8s/06-secrets.yml
kubectl apply -f k8s/07-configmap.yml
kubectl apply -f k8s/12-postgres-init.yml
kubectl apply -f k8s/11-postgres-pv.yml
```

The Kubernetes configuration uses database name **`marrow_shop`**. The original local-development README uses **`morrow_shop`**. Follow the Kubernetes ConfigMap for this deployment and keep `POSTGRES_DB` and `DB_NAME` consistent.

### 3. Start PostgreSQL

```bash
kubectl apply -f k8s/10-postgres-service.yml
kubectl apply -f k8s/09-postgres.yml
kubectl rollout status statefulset/postgres -n marrow-ns --timeout=180s
kubectl get pv
kubectl get pvc -n marrow-ns
```

The StatefulSet creates Pod `postgres-0` and PVC `pgdata-postgres-0`. The PVC requests `0.5Gi` using storage class `manual`; the static PV provides `2Gi` with reclaim policy `Retain`.

### 4. Start the application

```bash
kubectl apply -f k8s/08-backend-service.yml
kubectl apply -f k8s/05-backend-deployment.yml
kubectl apply -f k8s/04-frontend-service.yml
kubectl apply -f k8s/03-frontend-deployment.yml

kubectl rollout status deployment/backend-deployment -n marrow-ns --timeout=180s
kubectl rollout status deployment/frontend-deployment -n marrow-ns --timeout=180s
kubectl get pods,svc -n marrow-ns
```

This applies the Deployment-based setup without creating the standalone frontend exercise Pod from `02-frontend-pod.yml`. Expect two frontend Pods, two backend Pods, and one PostgreSQL Pod. Frontend/backend manifests currently have no readiness probes, so also verify the API and checkout below.

## Access the Application

### Port forwarding

Run this on the machine where `kubectl` can access the cluster, and keep the terminal open:

```bash
kubectl port-forward -n marrow-ns svc/frontend-service 8081:80
```

Open **http://localhost:8081** on that machine. Port `8081` avoids the host port `8080` already reserved in the KIND configuration.

If KIND runs on an EC2 instance, keep port forwarding running there. From your laptop, create an SSH tunnel using your own key and instance address:

```bash
ssh -i /path/to/key.pem -L 8081:127.0.0.1:8081 ubuntu@YOUR_EC2_PUBLIC_IP
```

Then open **http://localhost:8081** on your laptop.

### Optional: use the configured NodePort mapping

The checked-in KIND configuration maps host port `8080` to node port `30080`, but the frontend Service currently declares `nodePort: 30001`. These must match for the mapped route to work.

To use that route, change `nodePort` in `k8s/04-frontend-service.yml` to **`30080`** and reapply the file. With a cluster created from the checked-in KIND configuration, open **http://localhost:8080** on the KIND host. This edit is optional when using port forwarding.

## Verify the Working Application

With frontend port forwarding active:

```bash
curl -i http://localhost:8081/api/health/live
curl -i http://localhost:8081/api/health/ready
curl -i http://localhost:8081/api/products
```

The liveness endpoint checks the API process. Readiness checks database connectivity. The products endpoint confirms the catalog query works through the frontend proxy.

In the browser:

1. Load the product catalog and try search/category filters.
2. Add a product to the cart and update its quantity.
3. Complete checkout using demo customer details.
4. Confirm the order succeeds and inventory updates.

Inspect saved orders without printing customer details:

```bash
kubectl exec -n marrow-ns postgres-0 -- sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, total_cents, created_at FROM orders ORDER BY id DESC LIMIT 5;"'
```

## Database Initialization and Persistence

The `postgres-init` ConfigMap mounts SQL under `/docker-entrypoint-initdb.d`. PostgreSQL runs these scripts **only when initializing an empty data directory**. Updating the ConfigMap does not automatically rerun SQL against existing data.

The PV stores data at `/mnt/pg-data` **inside a KIND node container**. The current hostPath PV has no node affinity: a replacement database Pod scheduled onto another node may see a different directory. This setup does not guarantee persistence across node changes or cluster deletion, and `Retain` is not a backup.

For a reliable multi-node persistence exercise, first use storage tied to the correct node or a suitable provisioner. Then compare saved orders before and after replacing the database Pod, and verify which node it runs on. Do not treat a successful same-node restart as proof of durability across nodes.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| UI loads but catalog returns `503` | Inspect backend logs, database connectivity, database name, credentials, and whether tables were initialized. |
| `/api` requests fail through the frontend | Verify `API_PROXY_TARGET=http://backend-service:5000` and that the image contains the current Vite config. |
| Host port `8080` does not reach the app | Match the Service NodePort with KIND's `30080` mapping, or use port forwarding on `8081`. |
| PVC remains `Pending` | Check PV availability, storage class `manual`, requested capacity, and access mode. |
| Changing the Secret does not fix database authentication | Existing PostgreSQL data retains its initialized password; changing the environment Secret alone does not update the database role password. |
| A Pod is `Running` but the application fails | Check API responses and logs; frontend/backend readiness probes are not configured yet. |

```bash
kubectl logs -n marrow-ns -l app=marrow-be --all-containers=true --prefix --tail=100
kubectl logs -n marrow-ns postgres-0 --tail=100
kubectl describe pod -n marrow-ns postgres-0
kubectl get pods -n marrow-ns -o wide
kubectl get events -n marrow-ns --sort-by=.metadata.creationTimestamp
```

## What This Practice Covers

Container deployment, namespaces, replicas, Service routing and DNS, ConfigMaps, Secrets, StatefulSets, PV/PVC binding, database initialization, resource limits, and troubleshooting a three-tier application.

Possible next steps include backend health probes, stronger storage configuration, immutable image tags, GitHub Actions CI, and GitOps deployment with Argo CD. These are extensions to the current setup.

## References

- [Application setup and API documentation](../README.md)
- [KIND configuration and NodePort mapping](https://kind.sigs.k8s.io/docs/user/configuration/)
- [Vite preview proxy options](https://vite.dev/config/preview-options.html#preview-proxy)

**Author:** [Akash Verma](https://github.com/akverma24400)