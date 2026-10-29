import { startAnvil } from '../test/fork/globalSetup';
import { E2E_CHAIN_IDS, e2eClients } from './anvil';

// Anvil E2E di blok pin, akun tes dibersihkan dari delegasi 7702. Fungsi yang dikembalikan = teardown Playwright.
export default async function globalSetup() {
  const anvils = await Promise.all(E2E_CHAIN_IDS.map((id) => startAnvil(id, e2eClients(id))));
  return async () => {
    await Promise.all(
      anvils
        .filter((anvil) => anvil.exitCode === null)
        .map((anvil) => new Promise((resolve) => anvil.once('exit', resolve).kill('SIGTERM'))),
    );
  };
}
