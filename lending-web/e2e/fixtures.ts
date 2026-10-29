import { expect, test as base, type Page } from '@playwright/test';
import type { Hex } from 'viem';

import { TX, TX_ERROR } from '../src/copy';
import { e2eClients } from './anvil';

// Anvil E2E: snapshot sebelum tiap test, revert sesudahnya (sama dengan revertPerTest test fork).
export const test = base.extend<{ forkState: void }>({
  forkState: [
    async ({}, use) => {
      const { testClient } = e2eClients(1);
      const snapshot: Hex = await testClient.snapshot();
      await use();
      await testClient.revert({ id: snapshot });
    },
    { auto: true },
  ],
});

export { expect };

// Connector fork: RainbowKit → "Anvil (fork lokal)", akun user tes, tanpa popup (Anvil yang sign).
export async function connectAnvil(page: Page) {
  await page.getByTestId('rk-connect-button').click();
  await page.getByRole('button', { name: /Anvil \(fork lokal\)/ }).click();
  await expect(page.getByTestId('rk-account-button')).toBeVisible();
}

// Panel Dev Tools (tiket 17), cuma ada di FORK MODE. Flag-nya di memori modul: halaman baru = semua mati.
export async function openDevTools(page: Page) {
  await page.getByText('DEV TOOLS').click();
}

/** Pilih tab + aset di panel aksi, lalu isi jumlah. */
export async function fillPanel(page: Page, tab: 'Supply' | 'Withdraw' | 'Borrow' | 'Repay', symbol: string, amount: string) {
  // Panel aksi = <aside> yang punya tab; Dev Tools juga punya pilihan "Aset" (faucet).
  const panel = page.locator('aside').filter({ has: page.getByRole('tablist') });
  await panel.getByRole('tab', { name: tab, exact: true }).click();
  await panel.getByLabel('Aset', { exact: true }).selectOption({ label: symbol });
  await panel.getByLabel('Jumlah', { exact: true }).fill(amount);
}

export function actionButton(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

/** Pesan sukses panel aksi (teks dari copy.ts, jadi test ikut kalau teksnya berubah). */
export async function expectTxSuccess(page: Page, kind: 'supply' | 'borrow' | 'repay', amount: string, symbol: string) {
  await expect(page.getByText(TX.success[kind](amount, symbol))).toBeVisible();
}

export const REJECTED_NOTICE = TX_ERROR.rejected;
