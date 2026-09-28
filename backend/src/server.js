import { app } from "./app.js";
import { pool } from "./db.js";

const port = Number(process.env.PORT || 5000);
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Morrow Shop API listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
