import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { createRedactor, pipeRedacted } from '../../scripts/redact.mjs';

// Tiket 25: Ponder mencetak error RPC lengkap dengan URL (key Alchemy di path). Nilai di bawah palsu.
const KEYED = 'https://base-mainnet.g.alchemy.com/v2/FAKEkey1234567890abc';

describe('redaksi URL RPC', () => {
  const redact = createRedactor({ PONDER_RPC_URL_8453: KEYED, DATABASE_URL: 'postgres://ponder:pw@localhost:5434/db', OTHER: 'biarkan' });

  it('nilai env RPC/DB diganti nama variabelnya', () => {
    expect(redact(`URL: ${KEYED}  Request body: {}`)).toBe('URL: <PONDER_RPC_URL_8453>  Request body: {}');
    expect(redact('db postgres://ponder:pw@localhost:5434/db')).toBe('db <DATABASE_URL>');
    expect(redact('biarkan')).toBe('biarkan');
  });

  it('URL ber-key yang bukan nilai env persis tetap disamarkan', () => {
    expect(redact('https://eth-mainnet.g.alchemy.com/v2/OTHERkey99887766/')).toBe('<url ber-key>/');
    expect(redact('wss://mainnet.infura.io/v3/abcdef0123456789')).toBe('<url ber-key>');
    expect(redact('http://127.0.0.1:8555')).toBe('http://127.0.0.1:8555');
  });

  it('URL yang terpotong di dua chunk tetap disaring utuh', async () => {
    const from = new PassThrough();
    const to = new PassThrough();
    let out = '';
    to.on('data', (chunk) => (out += chunk));
    pipeRedacted(from, to, redact);
    from.write(`WARN ${KEYED.slice(0, 30)}`);
    from.write(`${KEYED.slice(30)} gagal\n`);
    from.end();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(out).toBe('WARN <PONDER_RPC_URL_8453> gagal\n');
  });
});
