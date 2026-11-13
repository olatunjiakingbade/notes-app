// db.js: one shared PostgreSQL connection pool.
// The password comes from OCI Vault when DB_PASSWORD_SECRET_OCID is set.
// Otherwise it comes from DB_PASSWORD (used for local development only).
const { Pool } = require("pg");
const vault = require("./vault");

let poolPromise = null;

async function createPool() {
  const password = process.env.DB_PASSWORD_SECRET_OCID
    ? await vault.getSecretValue(process.env.DB_PASSWORD_SECRET_OCID)
    : process.env.DB_PASSWORD;

  return new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password,
    // Encrypted connection. For production, verify the server certificate with a
    // CA bundle instead of rejectUnauthorized: false.
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    max: 10,
  });
}

// Create the pool on first use. If Vault is unreachable, the next request retries.
function getPool() {
  if (!poolPromise) {
    poolPromise = createPool().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

module.exports = {
  query: async (text, params) => (await getPool()).query(text, params),
};
