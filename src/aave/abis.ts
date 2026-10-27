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

export const poolAbi = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
]);
