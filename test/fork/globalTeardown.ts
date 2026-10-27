export default async function globalTeardown() {
  const anvil = globalThis.forkTestAnvil;
  if (!anvil || anvil.exitCode !== null) return;
  await new Promise((resolve) => {
    anvil.once('exit', resolve);
    anvil.kill('SIGTERM');
  });
}
