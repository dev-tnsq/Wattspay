import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { env } from '../config/env';

const resolveNetwork = (): Network => {
  switch (env.APTOS_NETWORK) {
    case 'mainnet':
      return Network.MAINNET;
    case 'testnet':
      return Network.TESTNET;
    case 'devnet':
    default:
      return Network.DEVNET;
  }
};

const config = new AptosConfig({
  network: resolveNetwork(),
  fullnode: env.APTOS_NODE_URL,
  faucet: env.APTOS_FAUCET_URL,
});

export const aptos = new Aptos(config);

// Smart Contract Addresses
export const SMART_CONTRACTS = {
  USER_REGISTRY: env.USER_REGISTRY_ADDRESS,
  PAYMENT_COORDINATOR: env.PAYMENT_COORDINATOR_ADDRESS,
  GROUP_TREASURY: env.GROUP_TREASURY_ADDRESS,
} as const;

// Contract Module Names
export const CONTRACT_MODULES = {
  USER_REGISTRY: `${SMART_CONTRACTS.USER_REGISTRY}::user_registry`,
  PAYMENT_COORDINATOR: `${SMART_CONTRACTS.PAYMENT_COORDINATOR}::payment_coordinator`,
  GROUP_TREASURY: `${SMART_CONTRACTS.GROUP_TREASURY}::group_treasury`,
} as const;
