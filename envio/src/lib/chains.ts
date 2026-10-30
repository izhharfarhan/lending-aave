// Per-chain addresses, copied from lending-indexer/src/chains.ts, which reads them from
// @bgd-labs/aave-address-book 4.44.22. Lowercased: address_format is lowercase in config.yaml.
export const CHAINS = {
  1: {
    name: "mainnet",
    pool: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
    wethGateway: "0xd01607c3c5ecaba394d8be377a08590149325722",
    aWeth: "0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8",
    treasury: "0x464c71f6c2f760dda6093dcb91c24c39e5d6e18c",
    oracle: "0x54586be62e3c3580375ae3723c145253060ca0c2",
  },
  8453: {
    name: "base",
    pool: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
    wethGateway: "0xa0d9c1e9e48ca30c8d8c3b5d69ff5dc1f6dffc24",
    aWeth: "0xd4a0e0b9149bcee3c920d2e00b5de09138fd8bb7",
    treasury: "0xba9424d650a4f5c80a0da641254d1acce2a37057",
    oracle: "0x2cc0fc26ed4563a5ce5e8bdcfe1a2878676ae156",
  },
  42161: {
    name: "arbitrum",
    pool: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
    wethGateway: "0x5283beced7adf6d003225c13896e536f2d4264ff",
    aWeth: "0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8",
    treasury: "0x053d55f9b5af8694c503eb288a1b7e552f590710",
    oracle: "0xb56c2f0b653b2e0b10c9b928c8580ac5df02c7c7",
  },
} as const;

export type ChainId = keyof typeof CHAINS;
