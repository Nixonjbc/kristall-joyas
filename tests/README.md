Tests use an isolated in-memory PostgreSQL engine (PGlite), never the live project.
Run: npm install --prefix /tmp/kristall-test @electric-sql/pglite
PGLITE_MODULE=/tmp/kristall-test/node_modules/@electric-sql/pglite/dist/index.js node tests/database.mjs

node tests/transport.mjs

The optional supabase-rollback.sql integration test uses reversible, transaction-scoped fixtures on Supabase and leaves no users, memberships, licenses or financial rows behind. Run only against the selected authorized project.
