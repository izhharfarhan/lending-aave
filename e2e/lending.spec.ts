import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type { Page } from '@playwright/test';
import { erc20Abi, parseEther, parseUnits, type Address } from 'viem';

import { AAVE } from '../src/config/contracts';
import { CTA, GRANT } from '../src/copy';
import { TEST_ACCOUNT } from '../test/fork/clients';
import { e2eClients } from './anvil';
import { actionButton, connectAnvil, expect, expectTxSuccess, fillPanel, openDevTools, REJECTED_NOTICE, test } from './fixtures';

// Tiket 24: alur utama supply → borrow → repay + skenario reject di browser beneran, lewat connector fork (Anvil yang
// sign) dan panel Dev Tools. Sembilan state Q22 dan matriks langkah/reject lengkap sudah diuji di modul domain dan
// `nextStep` (Jest); di sini cuma dibuktikan bahwa UI benar-benar mengirim tx-nya dan reject mendarat di langkah yang
// sama lalu bisa dilanjutkan.
const { publicClient } = e2eClients(1);
const POOL = AAVE[1].pool;
const { USDC: { UNDERLYING: USDC, V_TOKEN: USDC_DEBT }, WETH: { A_TOKEN: A_WETH } } = AaveV3Ethereum.ASSETS;

const balanceOf = (token: Address) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [TEST_ACCOUNT] });
const sentTxCount = () => publicClient.getTransactionCount({ address: TEST_ACCOUNT });
const usdcAllowance = () =>
  publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [TEST_ACCOUNT, POOL] });

async function openEthereum(page: Page) {
  await page.goto('/?chain=ethereum');
  await connectAnvil(page);
  // Posisi dibaca sesudah connect; panel siap begitu tab bisa dipilih dan saldo wallet tampil.
  await expect(page.getByRole('tab', { name: 'Supply', exact: true })).toBeEnabled();
}

const APPROVE_THEN_REPAY = GRANT.pool.cta('USDC', 'repay');
const DELEGATE_THEN_BORROW = GRANT.delegation.cta('ETH', 'borrow');

async function supplyEth(page: Page, amount: string) {
  await fillPanel(page, 'Supply', 'ETH', amount);
  await actionButton(page, CTA.supply(amount, 'ETH')).click();
  await expectTxSuccess(page, 'supply', amount, 'ETH');
}

async function borrowUsdc(page: Page, amount: string) {
  await fillPanel(page, 'Borrow', 'USDC', amount);
  await actionButton(page, CTA.borrow(amount, 'USDC')).click();
  await expectTxSuccess(page, 'borrow', amount, 'USDC');
}

test('supply ETH → borrow USDC → repay USDC (approve lalu repay)', async ({ page }) => {
  await openEthereum(page);

  await supplyEth(page, '1');
  expect(await balanceOf(A_WETH)).toBeGreaterThanOrEqual(parseEther('1') - 1n);

  await borrowUsdc(page, '500');
  expect(await balanceOf(USDC)).toBe(parseUnits('500', 6));

  await fillPanel(page, 'Repay', 'USDC', '200');
  await actionButton(page, APPROVE_THEN_REPAY).click();
  await expectTxSuccess(page, 'repay', '200', 'USDC');
  expect(await balanceOf(USDC)).toBe(parseUnits('300', 6));
  // Utang tersisa ±300 USDC (+ bunga beberapa detik).
  const debt = await balanceOf(USDC_DEBT);
  expect(debt).toBeGreaterThanOrEqual(parseUnits('300', 6));
  expect(debt).toBeLessThan(parseUnits('300.01', 6));
});

test('reject di wallet: supply dan approve kembali ke langkah yang sama tanpa tx, lalu bisa dilanjutkan', async ({ page }) => {
  await openEthereum(page);
  await openDevTools(page);
  const rejectTx = page.getByLabel('Tolak transaksi (approve, delegasi, aksi Pool)');
  const notice = page.getByText(REJECTED_NOTICE);

  // Aksi Pool ditolak: nggak ada tx terkirim, tombol tetap supply.
  let nonce = await sentTxCount();
  await rejectTx.check();
  await fillPanel(page, 'Supply', 'ETH', '1');
  await actionButton(page, CTA.supply('1', 'ETH')).click();
  await expect(notice).toBeVisible();
  await expect(actionButton(page, CTA.supply('1', 'ETH'))).toBeEnabled();
  expect(await sentTxCount()).toBe(nonce);

  await rejectTx.uncheck();
  await actionButton(page, CTA.supply('1', 'ETH')).click();
  await expectTxSuccess(page, 'supply', '1', 'ETH');

  await borrowUsdc(page, '500');
  // Pesan penolakan pertama sudah hilang, jadi pesan berikutnya benar-benar dari approve.
  await expect(notice).toBeHidden();

  // Approve ditolak: izin tetap 0, tombol tetap approve.
  nonce = await sentTxCount();
  await rejectTx.check();
  await fillPanel(page, 'Repay', 'USDC', '200');
  await actionButton(page, APPROVE_THEN_REPAY).click();
  await expect(notice).toBeVisible();
  await expect(actionButton(page, APPROVE_THEN_REPAY)).toBeEnabled();
  expect(await sentTxCount()).toBe(nonce);
  expect(await usdcAllowance()).toBe(0n);

  await rejectTx.uncheck();
  await actionButton(page, APPROVE_THEN_REPAY).click();
  await expectTxSuccess(page, 'repay', '200', 'USDC');
  expect(await balanceOf(USDC)).toBe(parseUnits('300', 6));
});

test('reject di wallet: credit delegation borrow ETH kembali ke langkah yang sama, lalu bisa dilanjutkan', async ({ page }) => {
  await openEthereum(page);
  await supplyEth(page, '1');
  await openDevTools(page);
  const rejectTx = page.getByLabel('Tolak transaksi (approve, delegasi, aksi Pool)');
  const delegateAndBorrow = actionButton(page, DELEGATE_THEN_BORROW);

  const nonce = await sentTxCount();
  await rejectTx.check();
  await fillPanel(page, 'Borrow', 'ETH', '0.1');
  await delegateAndBorrow.click();
  await expect(page.getByText(REJECTED_NOTICE)).toBeVisible();
  await expect(delegateAndBorrow).toBeEnabled();
  expect(await sentTxCount()).toBe(nonce);

  await rejectTx.uncheck();
  await delegateAndBorrow.click();
  // Jumlah di pesan ditulis gaya Indonesia (koma desimal, Q8).
  await expectTxSuccess(page, 'borrow', '0,1', 'ETH');
});
