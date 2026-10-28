import { parseAbi } from 'viem';

// Event Pool Aave v3.7 (POOL_REVISION 11) yang di-index (V1). Likuidasi menyusul di tiket 21.
export const PoolAbi = parseAbi([
  'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)',
  'event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)',
  'event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)',
  'event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)',
  'event ReserveUsedAsCollateralEnabled(address indexed reserve, address indexed user)',
  'event ReserveUsedAsCollateralDisabled(address indexed reserve, address indexed user)',
]);
