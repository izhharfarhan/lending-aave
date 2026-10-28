// URL RPC ber-key nggak boleh sampai ke terminal/log (tiket 25). Ponder mencetak error RPC lengkap (HttpRequestError viem
// memuat "URL: <url>", dan viem cuma membersihkan `user:pass@`, bukan key di path `/v2/<key>`), misalnya waktu 429 saat
// mengejar blok. Output proses anak disaring di sini sebelum diteruskan.
const SECRET_ENV = /^(PONDER_RPC_URL|ANVIL_FORK_URL|NEXT_PUBLIC_RPC_URL)_\d+$|^DATABASE_URL$/;
// Cadangan untuk URL yang nggak persis sama dengan nilai env (mis. ditambah `/` di belakang): key di path ala Alchemy
// (/v2/<key>) atau Infura (/v3/<key>).
const KEYED_PATH = /(https?|wss?):\/\/[^\s"'`<>]*\/v[23]\/[A-Za-z0-9_-]{8,}/g;

export function createRedactor(env = process.env) {
  // Nilai terpanjang dulu, biar URL yang memuat URL lain diganti utuh.
  const secrets = Object.entries(env)
    .filter(([name, value]) => SECRET_ENV.test(name) && value && value.length >= 8)
    .sort(([, a], [, b]) => b.length - a.length);
  return (text) => {
    let out = text;
    for (const [name, value] of secrets) out = out.split(value).join(`<${name}>`);
    return out.replace(KEYED_PATH, '<url ber-key>');
  };
}

// Disaring per baris: satu baris log nggak pernah terpotong di tengah URL. Sisa tanpa newline (redraw UI Ponder)
// diteruskan sesudah jeda singkat supaya tampilan nggak tertahan.
export function pipeRedacted(from, to, redact) {
  let pending = '';
  let timer;
  const flush = () => {
    timer = undefined;
    if (pending) to.write(redact(pending));
    pending = '';
  };
  from.setEncoding('utf8');
  from.on('data', (chunk) => {
    pending += chunk;
    const cut = pending.lastIndexOf('\n') + 1;
    if (cut > 0) {
      to.write(redact(pending.slice(0, cut)));
      pending = pending.slice(cut);
    }
    clearTimeout(timer);
    if (pending) timer = setTimeout(flush, 30);
  });
  from.on('end', () => {
    clearTimeout(timer);
    flush();
  });
}
