import { parseAbi } from 'viem';

// ABI `IUiPoolDataProviderV3` versi aave-v3-origin (v3.7). Yang di @bgd-labs/aave-address-book masih bentuk v3.0
// (ada stable rate, tanpa `virtualUnderlyingBalance`), jadi decode-nya bakal salah kalau dipakai ke kontrak v3.7.
// `getEModes` sengaja belum ada: struct-nya di kontrak yang ter-deploy beda dengan aave-v3-origin `main` (decode
// gagal di blok pin), dan E-Mode baru dibaca di tiket 14.
export const uiPoolDataProviderAbi = parseAbi([
  'struct AggregatedReserveData { address underlyingAsset; string name; string symbol; uint256 decimals; uint256 baseLTVasCollateral; uint256 reserveLiquidationThreshold; uint256 reserveLiquidationBonus; uint256 reserveFactor; bool usageAsCollateralEnabled; bool borrowingEnabled; bool isActive; bool isFrozen; uint128 liquidityIndex; uint128 variableBorrowIndex; uint128 liquidityRate; uint128 variableBorrowRate; uint40 lastUpdateTimestamp; address aTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint256 availableLiquidity; uint256 totalScaledVariableDebt; uint256 priceInMarketReferenceCurrency; address priceOracle; uint256 variableRateSlope1; uint256 variableRateSlope2; uint256 baseVariableBorrowRate; uint256 optimalUsageRatio; bool isPaused; bool isSiloedBorrowing; uint128 accruedToTreasury; uint128 isolationModeTotalDebt; bool flashLoanEnabled; uint256 debtCeiling; uint256 debtCeilingDecimals; uint256 borrowCap; uint256 supplyCap; bool borrowableInIsolation; uint128 virtualUnderlyingBalance; uint128 deficit; }',
  'struct UserReserveData { address underlyingAsset; uint256 scaledATokenBalance; bool usageAsCollateralEnabledOnUser; uint256 scaledVariableDebt; }',
  'struct BaseCurrencyInfo { uint256 marketReferenceCurrencyUnit; int256 marketReferenceCurrencyPriceInUsd; int256 networkBaseTokenPriceInUsd; uint8 networkBaseTokenPriceDecimals; }',
  'function getReservesData(address provider) view returns (AggregatedReserveData[], BaseCurrencyInfo)',
  'function getUserReservesData(address provider, address user) view returns (UserReserveData[], uint8)',
]);

// Custom error Errors.sol v3.7 yang bisa muncul dari aksi user; ikut ABI supaya viem bisa men-decode revert-nya
// (`aaveErrorName`) dan pesan Indonesianya bisa dipilih.
export const poolAbi = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
  'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)',
  'error InvalidAmount()',
  'error ReserveInactive()',
  'error ReserveFrozen()',
  'error ReservePaused()',
  'error SupplyCapExceeded()',
  'error BorrowingNotEnabled()',
  'error BorrowCapExceeded()',
  'error CollateralCannotCoverNewBorrow()',
  'error HealthFactorLowerThanLiquidationThreshold()',
  'error LtvValidationFailed()',
  'error NoDebtOfSelectedType()',
  'error NotEnoughAvailableUserBalance()',
  'error UnderlyingBalanceZero()',
  'error UserHasAssetWithZeroLtv()',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
]);

// WrappedTokenGatewayV3 (aave-v3-origin): ETH dibungkus jadi WETH oleh gateway. Argumen pertama (pool) diabaikan kontrak
// v3.7 (gateway terikat ke satu Pool), tapi tetap diisi alamat Pool resmi.
export const gatewayAbi = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable',
  'function repayETH(address pool, uint256 amount, address onBehalfOf) payable',
]);
