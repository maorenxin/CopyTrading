/**
 * Coin sector classification for the momentum strategy universe.
 * Based on strategy/RESULTS.md sector breakdown, extended for new listings.
 */

const CATEGORIES: Record<string, string[]> = {
  L1: [
    'ETH', 'SOL', 'ADA', 'AVAX', 'DOT', 'ATOM', 'NEAR', 'APT', 'SUI', 'FTM',
    'ALGO', 'ICP', 'HBAR', 'STX', 'XLM', 'XRP', 'ETC', 'LTC', 'BCH', 'BNB',
    'TRX', 'NEO', 'IOTA', 'CELO', 'MINA', 'CFX', 'SEI', 'TIA', 'MNT', 'TON',
    'KAS', 'S', 'MOVE', 'BERA', 'INIT', 'NIL', 'SOPH',
  ],
  DeFi: [
    'AAVE', 'COMP', 'MKR', 'SNX', 'PENDLE', 'LDO', 'FXS', 'STG', 'RUNE', 'INJ',
    'CRV', 'JUP', 'ENA', 'ONDO', 'ETHFI', 'MORPHO', 'USUAL', 'CAKE',
  ],
  Meme: [
    'DOGE', 'KSHIB', 'KPEPE', 'KFLOKI', 'KLUNC', 'PEOPLE', 'KBONK', 'WIF',
    'BOME', 'BRETT', 'POPCAT', 'FARTCOIN', 'PNUT', 'TURBO', 'MOODENG', 'NOT',
    'MEME', 'PURR', 'SPX', 'GOAT', 'KNEIRO', 'HMSTR', 'DOOD', 'MELANIA',
    'TRUMP', 'VINE', 'ANIME', 'PENGU', 'BABY', 'NXPC', 'ZORA',
  ],
  'Gaming/NFT': [
    'AXS', 'SAND', 'IMX', 'GALA', 'YGG', 'APE', 'BLUR', 'ENS', 'GMT', 'WLD',
    'BIGTIME', 'XAI', 'SUPER', 'PIXEL', 'ACE',
  ],
  Infra: [
    'FIL', 'AR', 'FET', 'LINK', 'BLZ', 'OP', 'ARB', 'RENDER', 'IO', 'PYTH',
    'W', 'EIGEN', 'ZK', 'STRK', 'ZETA', 'LAYER', 'ZRO', 'MANTA', 'MERL',
    'ALT', 'POLYX', 'GAS', 'POL',
  ],
  AI: [
    'AIXBT', 'VIRTUAL', 'GRASS', 'GRIFFAIN', 'TAO', 'KAITO', 'VVV',
  ],
  Other: [
    'DASH', 'XMR', 'ZEC', 'ZEN', 'TRB', 'RSR', 'OGN', 'UMA', 'MAV', 'MATIC',
    'PAXG', 'BSV', 'ORDI', 'DYM', 'SAGA', 'REZ', 'TNSR', 'BIO', 'ARK',
    'AERO', 'BANANA', 'IP', 'JTO', 'HYPER', 'ME', 'SYRUP', 'WCT',
  ],
};

// Build reverse map: coin → category
const COIN_TO_CATEGORY: Record<string, string> = {};
for (const [cat, coins] of Object.entries(CATEGORIES)) {
  for (const coin of coins) {
    COIN_TO_CATEGORY[coin] = cat;
  }
}

export function getCoinCategory(coin: string): string {
  return COIN_TO_CATEGORY[coin.toUpperCase()] || '—';
}
