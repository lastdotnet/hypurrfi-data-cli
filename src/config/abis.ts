export const poolAbi = [
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getReserveData',
    outputs: [
      {
        components: [
          {
            components: [{ internalType: 'uint256', name: 'data', type: 'uint256' }],
            internalType: 'struct DataTypes.ReserveConfigurationMap',
            name: 'configuration',
            type: 'tuple',
          },
          { internalType: 'uint128', name: 'liquidityIndex', type: 'uint128' },
          { internalType: 'uint128', name: 'currentLiquidityRate', type: 'uint128' },
          { internalType: 'uint128', name: 'variableBorrowIndex', type: 'uint128' },
          { internalType: 'uint128', name: 'currentVariableBorrowRate', type: 'uint128' },
          { internalType: 'uint128', name: 'currentStableBorrowRate', type: 'uint128' },
          { internalType: 'uint40', name: 'lastUpdateTimestamp', type: 'uint40' },
          { internalType: 'uint16', name: 'id', type: 'uint16' },
          { internalType: 'address', name: 'aTokenAddress', type: 'address' },
          { internalType: 'address', name: 'stableDebtTokenAddress', type: 'address' },
          { internalType: 'address', name: 'variableDebtTokenAddress', type: 'address' },
          { internalType: 'address', name: 'interestRateStrategyAddress', type: 'address' },
          { internalType: 'uint128', name: 'accruedToTreasury', type: 'uint128' },
          { internalType: 'uint128', name: 'unbacked', type: 'uint128' },
          { internalType: 'uint128', name: 'isolationModeTotalDebt', type: 'uint128' },
        ],
        internalType: 'struct DataTypes.ReserveData',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getReservesList',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getUserAccountData',
    outputs: [
      { internalType: 'uint256', name: 'totalCollateralBase', type: 'uint256' },
      { internalType: 'uint256', name: 'totalDebtBase', type: 'uint256' },
      { internalType: 'uint256', name: 'availableBorrowsBase', type: 'uint256' },
      { internalType: 'uint256', name: 'currentLiquidationThreshold', type: 'uint256' },
      { internalType: 'uint256', name: 'ltv', type: 'uint256' },
      { internalType: 'uint256', name: 'healthFactor', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const eulerOraclePriceAbi = [
  {
    name: 'getQuote',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'base', type: 'address' },
      { name: 'quote', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const eVaultAbi = [
  { inputs: [], name: 'asset', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalBorrows',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'cash', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'interestRate',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'interestFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'assets', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'debtOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'oracle', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'unitOfAccount',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'governorAdmin',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'collateral', type: 'address' }],
    name: 'LTVBorrow',
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'collateral', type: 'address' }],
    name: 'LTVLiquidation',
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const isolatedPairAbi = [
  {
    inputs: [],
    name: 'collateralContract',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'asset', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'getPairAccounting',
    outputs: [
      { name: 'totalAssetAmount', type: 'uint128' },
      { name: 'totalAssetShares', type: 'uint128' },
      { name: 'totalBorrowAmount', type: 'uint128' },
      { name: 'totalBorrowShares', type: 'uint128' },
      { name: 'totalCollateral', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'previewAddInterest',
    outputs: [
      { name: '_interestEarned', type: 'uint256' },
      { name: '_feesAmount', type: 'uint256' },
      { name: '_feesShare', type: 'uint256' },
      {
        components: [
          { name: 'lastBlock', type: 'uint32' },
          { name: 'feeToProtocolRate', type: 'uint32' },
          { name: 'lastTimestamp', type: 'uint64' },
          { name: 'ratePerSec', type: 'uint64' },
          { name: 'fullUtilizationRate', type: 'uint64' },
        ],
        name: '_newCurrentRateInfo',
        type: 'tuple',
      },
      {
        components: [
          { name: 'amount', type: 'uint128' },
          { name: 'shares', type: 'uint128' },
        ],
        name: '_totalAsset',
        type: 'tuple',
      },
      {
        components: [
          { name: 'amount', type: 'uint128' },
          { name: 'shares', type: 'uint128' },
        ],
        name: '_totalBorrow',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'maxLTV', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'borrowLimit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'depositLimit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'exchangeRateInfo',
    outputs: [
      { name: 'oracle', type: 'address' },
      { name: 'maxOracleDeviation', type: 'uint32' },
      { name: 'lastTimestamp', type: 'uint184' },
      { name: 'lowExchangeRate', type: 'uint256' },
      { name: 'highExchangeRate', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getConstants',
    outputs: [
      { name: '_LTV_PRECISION', type: 'uint256' },
      { name: '_LIQ_PRECISION', type: 'uint256' },
      { name: '_UTIL_PREC', type: 'uint256' },
      { name: '_FEE_PRECISION', type: 'uint256' },
      { name: '_EXCHANGE_PRECISION', type: 'uint256' },
      { name: '_DEVIATION_PRECISION', type: 'uint256' },
      { name: '_RATE_PRECISION', type: 'uint256' },
      { name: '_MAX_PROTOCOL_FEE', type: 'uint256' },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getUserSnapshot',
    outputs: [
      { name: '_userAssetShares', type: 'uint256' },
      { name: '_userBorrowShares', type: 'uint256' },
      { name: '_userCollateralBalance', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const fraxOracleAbi = [
  {
    inputs: [],
    name: 'getPrices',
    outputs: [
      { name: 'isBadData', type: 'bool' },
      { name: 'priceLow', type: 'uint256' },
      { name: 'priceHigh', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const isolatedRegistryAbi = [
  {
    inputs: [],
    name: 'getAllPairAddresses',
    outputs: [{ internalType: 'address[]', name: '_deployedPairs', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'deployedPairsLength',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const perspectiveAbi = [
  {
    inputs: [],
    name: 'verifiedArray',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'verifiedLength',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'vault', type: 'address' }],
    name: 'isVerified',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const eEarnVaultAbi = [
  { inputs: [], name: 'asset', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'curator', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'guardian', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'timelock', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'fee', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [],
    name: 'withdrawQueueLength',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'index', type: 'uint256' }],
    name: 'withdrawQueue',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'contract IERC4626', name: '', type: 'address' }],
    name: 'config',
    outputs: [
      { internalType: 'uint112', name: 'balance', type: 'uint112' },
      { internalType: 'uint136', name: 'cap', type: 'uint136' },
      { internalType: 'bool', name: 'enabled', type: 'bool' },
      { internalType: 'uint64', name: 'removableAt', type: 'uint64' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const evcAbi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getControllers',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getCollaterals',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const erc20Abi = [
  { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const addressProviderAbi = [
  {
    inputs: [],
    name: 'getPriceOracle',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const aaveOracleAbi = [
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getAssetPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'assets', type: 'address[]' }],
    name: 'getAssetsPrices',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/** Account Lens — getAccountInfo for health factor */
export const accountLensAbi = [
  {
    type: 'function',
    name: 'getAccountInfo',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'vault', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          {
            name: 'evcAccountInfo',
            type: 'tuple',
            components: [
              { name: 'timestamp', type: 'uint256' },
              { name: 'evc', type: 'address' },
              { name: 'account', type: 'address' },
              { name: 'addressPrefix', type: 'bytes19' },
              { name: 'owner', type: 'address' },
              { name: 'isLockdownMode', type: 'bool' },
              { name: 'isPermitDisabledMode', type: 'bool' },
              { name: 'lastAccountStatusCheckTimestamp', type: 'uint256' },
              { name: 'enabledControllers', type: 'address[]' },
              { name: 'enabledCollaterals', type: 'address[]' },
            ],
          },
          {
            name: 'vaultAccountInfo',
            type: 'tuple',
            components: [
              { name: 'timestamp', type: 'uint256' },
              { name: 'account', type: 'address' },
              { name: 'vault', type: 'address' },
              { name: 'asset', type: 'address' },
              { name: 'assetsAccount', type: 'uint256' },
              { name: 'shares', type: 'uint256' },
              { name: 'assets', type: 'uint256' },
              { name: 'borrowed', type: 'uint256' },
              { name: 'assetAllowanceVault', type: 'uint256' },
              { name: 'assetAllowanceVaultPermit2', type: 'uint256' },
              { name: 'assetAllowanceExpirationVaultPermit2', type: 'uint256' },
              { name: 'assetAllowancePermit2', type: 'uint256' },
              { name: 'balanceForwarderEnabled', type: 'bool' },
              { name: 'isController', type: 'bool' },
              { name: 'isCollateral', type: 'bool' },
              {
                name: 'liquidityInfo',
                type: 'tuple',
                components: [
                  { name: 'queryFailure', type: 'bool' },
                  { name: 'queryFailureReason', type: 'bytes' },
                  { name: 'account', type: 'address' },
                  { name: 'vault', type: 'address' },
                  { name: 'unitOfAccount', type: 'address' },
                  { name: 'timeToLiquidation', type: 'int256' },
                  { name: 'liabilityValueBorrowing', type: 'uint256' },
                  { name: 'liabilityValueLiquidation', type: 'uint256' },
                  { name: 'collateralValueBorrowing', type: 'uint256' },
                  { name: 'collateralValueLiquidation', type: 'uint256' },
                  { name: 'collateralValueRaw', type: 'uint256' },
                  { name: 'collaterals', type: 'address[]' },
                  { name: 'collateralValuesBorrowing', type: 'uint256[]' },
                  { name: 'collateralValuesLiquidation', type: 'uint256[]' },
                  { name: 'collateralValuesRaw', type: 'uint256[]' },
                ],
              },
            ],
          },
          {
            name: 'accountRewardInfo',
            type: 'tuple',
            components: [
              { name: 'timestamp', type: 'uint256' },
              { name: 'account', type: 'address' },
              { name: 'vault', type: 'address' },
              { name: 'balanceTracker', type: 'address' },
              { name: 'balanceForwarderEnabled', type: 'bool' },
              { name: 'balance', type: 'uint256' },
              {
                name: 'enabledRewardsInfo',
                type: 'tuple[]',
                components: [
                  { name: 'reward', type: 'address' },
                  { name: 'earnedReward', type: 'uint256' },
                  { name: 'earnedRewardRecentIgnored', type: 'uint256' },
                ],
              },
            ],
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const
