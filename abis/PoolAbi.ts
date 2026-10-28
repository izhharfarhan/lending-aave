import { parseAbi } from 'viem';

// Event Pool Aave v3.7 (POOL_REVISION 11) yang di-index. Tiket 19: `Supply`; event lain menyusul di tiket 20–21.
export const PoolAbi = parseAbi([
  'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)',
]);
