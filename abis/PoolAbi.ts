import { parseAbi } from 'viem';

// Event Pool Aave v3.7 (POOL_REVISION 11) yang di-index (V1).
export const PoolAbi = parseAbi([
  'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)',
  'event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)',
  'event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)',
  'event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)',
  'event ReserveUsedAsCollateralEnabled(address indexed reserve, address indexed user)',
  'event ReserveUsedAsCollateralDisabled(address indexed reserve, address indexed user)',
  'event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)',
]);

// Getter yang dibaca handler likuidasi (V4 "Keputusan tiket 14", V5, Q16). `getReserveData` = struct legacy v3.7, cuma
// `id`-nya yang dipakai (bit di bitmap E-Mode).
export const PoolReadAbi = parseAbi([
  'function getReserveAToken(address asset) view returns (address)',
  'struct ReserveConfigurationMap { uint256 data; }',
  'function getConfiguration(address asset) view returns (ReserveConfigurationMap)',
  'struct ReserveDataLegacy { ReserveConfigurationMap configuration; uint128 liquidityIndex; uint128 currentLiquidityRate; uint128 variableBorrowIndex; uint128 currentVariableBorrowRate; uint128 currentStableBorrowRate; uint40 lastUpdateTimestamp; uint16 id; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt; }',
  'function getReserveData(address asset) view returns (ReserveDataLegacy)',
  'function getUserEMode(address user) view returns (uint256)',
  'struct CollateralConfig { uint16 ltv; uint16 liquidationThreshold; uint16 liquidationBonus; }',
  'function getEModeCategoryCollateralConfig(uint8 id) view returns (CollateralConfig)',
  'function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
]);

export const OracleAbi = parseAbi(['function getAssetPrice(address asset) view returns (uint256)']);
