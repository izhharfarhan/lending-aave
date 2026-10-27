export type WalletErrorKind = 'rejected' | 'wrong_network' | 'insufficient_funds' | 'failed';

type ErrorLike = { name?: unknown; code?: unknown; cause?: unknown };

// Error dari wallet / tx → jenis buat milih pesan bahasa Indonesia (spec 101, pola swap-web), bukan teks error mentah.
// Dicek di seluruh rantai `cause` lewat `name` / `code`, karena wagmi/viem suka ngebungkus error aslinya
// (dan bisa bawa salinan viem sendiri, jadi `instanceof` nggak bisa diandelin).
export function walletErrorKind(error: unknown): WalletErrorKind {
  for (let e = error as ErrorLike | undefined; typeof e === 'object' && e !== null; e = e.cause as ErrorLike | undefined) {
    // EIP-1193 code 4001 = user nolak di wallet.
    if (e.name === 'UserRejectedRequestError' || e.code === 4001) return 'rejected';
    // viem (`chain` tx ≠ chain wallet) dan wagmi (`chainId` ≠ chain connector).
    if (e.name === 'ChainMismatchError' || e.name === 'ConnectorChainMismatchError') return 'wrong_network';
    if (e.name === 'InsufficientFundsError') return 'insufficient_funds';
  }
  return 'failed';
}

/**
 * Ganti network (langkah "Ganti ke <chain>"): ditolak user, atau wallet nggak bisa pindah (chain belum dikenal wallet,
 * connector tanpa dukungan ganti network). Network wallet tetap yang lama di dua-duanya.
 */
export function switchChainErrorKind(error: unknown): Extract<WalletErrorKind, 'rejected' | 'failed'> {
  return walletErrorKind(error) === 'rejected' ? 'rejected' : 'failed';
}

// Nama custom error Aave (Errors.sol v3.7, mis. `SupplyCapExceeded`) dari revert yang sudah di-decode viem lewat ABI
// Pool. `undefined` = bukan revert kontrak, atau error-nya nggak ada di ABI.
export function aaveErrorName(error: unknown): string | undefined {
  for (let e = error as ErrorLike | undefined; typeof e === 'object' && e !== null; e = e.cause as ErrorLike | undefined) {
    if (e.name !== 'ContractFunctionRevertedError') continue;
    const name = (e as { data?: { errorName?: unknown } }).data?.errorName;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}
