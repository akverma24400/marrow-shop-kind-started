import express from "express";
import { pool } from "./db.js";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    console.error("Readiness check failed:", error);
    res.status(503).json({ error: "Database unavailable" });
  }
});

app.get("/api/products", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, category, description, price_cents, stock, symbol, color
      FROM products
      ORDER BY id
    `);
    res.json({ products: rows });
  } catch (error) {
    console.error("Product query failed:", error);
    res.status(503).json({ error: "Catalog unavailable. Please try again." });
  }
});

function validOrder(body) {
  const customer = body?.customer;
  const name = typeof customer?.name === "string" ? customer.name.trim() : null;
  const email =
    typeof customer?.email === "string" ? customer.email.trim() : null;
  const address =
    typeof customer?.address === "string" ? customer.address.trim() : null;
  const items = body?.items;

  if (
    typeof name !== "string" ||
    name.length < 2 ||
    name.length > 80 ||
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof address !== "string" ||
    address.length < 10 ||
    address.length > 500 ||
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 30
  ) {
    return null;
  }

  const seen = new Set();
  for (const item of items) {
    if (
      !item ||
      !Number.isSafeInteger(item.productId) ||
      item.productId < 1 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20 ||
      seen.has(item.productId)
    ) {
      return null;
    }
    seen.add(item.productId);
  }

  return { customer: { name, email, address }, items };
}

app.post("/api/orders", async (req, res) => {
  const order = validOrder(req.body);
  if (!order) {
    return res
      .status(400)
      .json({ error: "Enter valid customer details and cart items." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const ids = order.items.map((item) => item.productId);
    const { rows: products } = await client.query(
      "SELECT id, name, price_cents, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
      [ids],
    );

    const byId = new Map(products.map((product) => [product.id, product]));
    for (const item of order.items) {
      const product = byId.get(item.productId);
      if (!product || product.stock < item.quantity) {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({
            error:
              "An item is unavailable or its stock has changed. Refresh your cart.",
          });
      }
    }

    const total = order.items.reduce(
      (sum, item) => sum + byId.get(item.productId).price_cents * item.quantity,
      0,
    );
    const {
      rows: [savedOrder],
    } = await client.query(
      `INSERT INTO orders (customer_name, customer_email, shipping_address, total_cents)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [
        order.customer.name,
        order.customer.email,
        order.customer.address,
        total,
      ],
    );

    for (const item of order.items) {
      const product = byId.get(item.productId);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          savedOrder.id,
          product.id,
          product.name,
          item.quantity,
          product.price_cents,
        ],
      );
      await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2",
        [item.quantity, product.id],
      );
    }

    await client.query("COMMIT");
    res
      .status(201)
      .json({
        orderId: savedOrder.id,
        totalCents: total,
        createdAt: savedOrder.created_at,
      });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Order rollback failed:", rollbackError);
      }
    }
    console.error("Order failed:", error);
    res
      .status(503)
      .json({ error: "Could not place the order. Please try again." });
  } finally {
    client?.release();
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  console.error("Unexpected API error:", error);
  res.status(500).json({ error: "Unexpected server error" });
});
