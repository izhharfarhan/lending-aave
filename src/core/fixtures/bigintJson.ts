// Fixture on-chain penuh bigint; JSON nggak punya bigint, jadi disimpan sebagai string "123n".
const BIGINT = /^-?\d+n$/;

export const stringifyBigint = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? `${v}n` : v), 2);

export const parseBigint = <T>(text: string): T =>
  JSON.parse(text, (_key, v) => (typeof v === 'string' && BIGINT.test(v) ? BigInt(v.slice(0, -1)) : v)) as T;
