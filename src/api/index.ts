import { Hono } from 'hono';
import { db } from 'ponder:api';
import schema from 'ponder:schema';
import { graphql } from 'ponder';

// Hono `/graphql` (pola swap-indexer). CORS dipasang server Ponder sendiri di depan semua route (`origin: "*"`).
const app = new Hono();

app.use('/graphql', graphql({ db, schema }));

export default app;
