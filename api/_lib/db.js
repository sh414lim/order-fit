const { Pool } = require('pg');

let pool;
function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  // Supabase pooler URLs commonly include libpq-only SSL parameters. Remove
  // those before passing the URL to node-postgres, then use the explicit
  // encrypted connection policy below.
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.delete('sslmode');
  connection.searchParams.delete('pgbouncer');
  pool ||= new Pool({ connectionString: connection.toString(), ssl: { rejectUnauthorized: false }, max: 2 });
  return pool;
}

module.exports = { database };
