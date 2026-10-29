export default async function globalTeardown() {
  const running = (globalThis.forkTestAnvils ?? []).filter((anvil) => anvil.exitCode === null);
  await Promise.all(
    running.map(
      (anvil) =>
        new Promise((resolve) => {
          anvil.once('exit', resolve);
          anvil.kill('SIGTERM');
        }),
    ),
  );
}
