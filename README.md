# Morrow Shop — three-tier Kubernetes practice app

A small, working e-commerce demo for practicing Docker, Docker Compose, and Kubernetes on kind. It has a storefront, an API, and a PostgreSQL database. Browse products, search and filter, add items to a cart, and place a **demo order** that is saved in PostgreSQL. No payment is collected.

## Architecture

| Tier     | Folder      | Technology                | Local port | Responsibility                          |
| -------- | ----------- | ------------------------- | ---------- | --------------------------------------- |
| Frontend | `frontend/` | Vanilla JavaScript + Vite | 5173       | Product catalog, cart, checkout form    |
| Backend  | `backend/`  | Node.js + Express         | 5000       | Product and order API, health endpoints |
| Database | `database/` | PostgreSQL                | 5432       | Products, orders, order items           |

The frontend calls **relative `/api/...` paths**. During local development, Vite proxies them to `http://localhost:5000`. Once you build the frontend for containers, provide an equivalent route at your web server or ingress: `/api` to the backend, everything else to the frontend. A Vite development proxy is not included in the production build.

## Run it locally, before containerizing

Requirements: Node.js 20.19+ or 22.12+ and PostgreSQL. Create a database and load the schema/seed data:

```bash
createdb -U postgres morrow_shop
psql -U postgres -d morrow_shop -f database/init/01-schema.sql
```

If your PostgreSQL installation uses a different user or host, adjust the commands and `backend/.env` accordingly. In a fresh official PostgreSQL container, a SQL file mounted under `/docker-entrypoint-initdb.d/` can initialize the database; those scripts run only when the data directory is first initialized.

In terminal 1:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

In terminal 2:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The `.env.example` values assume a local PostgreSQL server with user `postgres`, password `postgres`, and database `morrow_shop`. Change them to match yours. To inspect the API, open `http://localhost:5000/api/products` or run `curl http://localhost:5000/api/health/ready`.

## API

| Method | Path                | Purpose                                                 |
| ------ | ------------------- | ------------------------------------------------------- |
| GET    | `/api/health/live`  | Process is running; does not query the database         |
| GET    | `/api/health/ready` | Database connection works; use for readiness            |
| GET    | `/api/products`     | List products and current stock                         |
| POST   | `/api/orders`       | Save a demo order and decrease stock in one transaction |

Order JSON example:

```json
{
  "customer": {
    "name": "Akash Verma",
    "email": "akash@example.com",
    "address": "123 Demo Street, Dehradun"
  },
  "items": [{ "productId": 1, "quantity": 2 }]
}
```

Prices are stored as integer **paise** (`price_cents`) and displayed in INR. The backend gets prices from PostgreSQL, checks stock, and uses a database transaction for the order. The browser's cart uses `localStorage`; orders and inventory live in PostgreSQL.

## Your practice path

This starter intentionally contains **no Dockerfiles, Compose file, or Kubernetes manifests** so you can make each layer yourself.

1. **Dockerfiles:** Build a static frontend image, a Node.js backend image, and (for practice) a PostgreSQL image that copies `database/init/01-schema.sql` to the initialization directory. You can also use the official PostgreSQL image directly with a mounted SQL file.
2. **Compose:** Start all three services on one network. Supply `DB_HOST` as the **database service name**, not `localhost`. Give PostgreSQL a named volume. Make sure browser requests to `/api` reach the backend; a reverse proxy or an equivalent route is needed when serving the built frontend.
3. **kind:** Create a cluster and load your locally built images with `kind load docker-image` (or push images to a registry). Start with Deployments/Services for frontend and backend, and a Secret for database credentials. Route `/api` and `/` to the right services, then access the site with an ingress or port forwarding through a suitable gateway.
4. **Storage:** Move PostgreSQL to a StatefulSet with a PVC. Recreate its Pod and confirm the order remains. Initialization SQL seeds only a fresh data directory.
5. **Health and scale:** Use `/api/health/live` and `/api/health/ready` for backend probes. Scale the backend to two replicas and place another order. The shared database holds orders; the browser owns the cart.
6. **Configuration:** Try changing database credentials and host through Secrets and environment variables. Avoid putting secrets into an image or Git.

Useful checks after each stage: product list loads, adding to cart works, an order changes stock, and an order survives backend restart. After adding persistent storage, repeat the check across a PostgreSQL Pod replacement.

## Notes

- This is a learning app. Checkout creates an order without authentication, payments, shipping, or an admin system. Do not expose it publicly as a real store.
- `database/init/01-schema.sql` is safe to run more than once: tables use `IF NOT EXISTS` and products use `ON CONFLICT DO NOTHING`.
- The API binds to `0.0.0.0` to work in containers. Keep its database password in environment configuration.
