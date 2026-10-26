Tests use an isolated in-memory PostgreSQL engine (PGlite), never the live project.
Run: npm install --prefix /tmp/kristall-test @electric-sql/pglite
PGLITE_MODULE=/tmp/kristall-test/node_modules/@electric-sql/pglite/dist/index.js node tests/database.mjs
