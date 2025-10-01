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
