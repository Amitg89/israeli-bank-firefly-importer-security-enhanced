import { createRequire } from 'node:module';
import config from 'nconf';
import nconfYaml from 'nconf-yaml';
import { decryptObject, isEncrypted } from './crypto.js';

const require = createRequire(import.meta.url);

// Environment variable mappings for non-sensitive config
const envMap = {
  FIREFLY_BASE_URL: 'firefly:baseUrl',
  FIREFLY_TOKEN_API: 'firefly:tokenApi',
  CRON: 'cron',
  SCRAPER_PARALLEL: 'scraper:parallel',
  SCRAPER_TIMEOUT: 'scraper:timeout',
  SCRAPER_START_DATE: 'scraper:startDate',
  LOG_LEVEL: 'log:level',
};

config
  .defaults(require('../config/default.json'));

/**
 * Checks if any value in the config contains encrypted data
 */
function hasEncryptedValues(obj) {
  if (obj === null || obj === undefined) return false;

  if (typeof obj === 'string') {
    return isEncrypted(obj);
  }

  if (Array.isArray(obj)) {
    return obj.some((item) => hasEncryptedValues(item));
  }

  if (typeof obj === 'object') {
    return Object.values(obj).some((value) => hasEncryptedValues(value));
  }

  return false;
}

/**
 * Applies environment variable overrides for bank credentials
 * Format: BANK_0_USERNAME, BANK_0_PASSWORD, CREDITCARD_0_0_ID, etc.
 */
function applyCredentialEnvOverrides() {
  const banks = config.get('banks') || [];

  banks.forEach((bank, bankIndex) => {
    // Bank credential overrides
    const bankUsername = process.env[`BANK_${bankIndex}_USERNAME`];
    const bankPassword = process.env[`BANK_${bankIndex}_PASSWORD`];
    const bankId = process.env[`BANK_${bankIndex}_ID`];
    const bankUserCode = process.env[`BANK_${bankIndex}_USERCODE`];

    if (bankUsername) {
      config.set(`banks:${bankIndex}:credentials:username`, bankUsername);
    }
    if (bankPassword) {
      config.set(`banks:${bankIndex}:credentials:password`, bankPassword);
    }
    if (bankId) {
      config.set(`banks:${bankIndex}:credentials:id`, bankId);
    }
    if (bankUserCode) {
      config.set(`banks:${bankIndex}:credentials:userCode`, bankUserCode);
    }

    // Credit card credential overrides
    const creditCards = bank.creditCards || [];
    creditCards.forEach((cc, ccIndex) => {
      const ccUsername = process.env[`BANK_${bankIndex}_CC_${ccIndex}_USERNAME`];
      const ccPassword = process.env[`BANK_${bankIndex}_CC_${ccIndex}_PASSWORD`];
      const ccId = process.env[`BANK_${bankIndex}_CC_${ccIndex}_ID`];
      const ccCard6Digits = process.env[`BANK_${bankIndex}_CC_${ccIndex}_CARD6DIGITS`];

      if (ccUsername) {
        config.set(`banks:${bankIndex}:creditCards:${ccIndex}:credentials:username`, ccUsername);
      }
      if (ccPassword) {
        config.set(`banks:${bankIndex}:creditCards:${ccIndex}:credentials:password`, ccPassword);
      }
      if (ccId) {
        config.set(`banks:${bankIndex}:creditCards:${ccIndex}:credentials:id`, ccId);
      }
      if (ccCard6Digits) {
        config.set(`banks:${bankIndex}:creditCards:${ccIndex}:credentials:card6Digits`, ccCard6Digits);
      }
    });
  });
}

/**
 * Decrypts all encrypted values in banks configuration
 */
async function decryptBanksConfig(masterPassword) {
  const banks = config.get('banks');
  if (!banks) return;

  const decryptedBanks = await decryptObject(banks, masterPassword);
  config.set('banks', decryptedBanks);
}

/**
 * Decrypts firefly tokenApi if encrypted
 */
async function decryptFireflyConfig(masterPassword) {
  const tokenApi = config.get('firefly:tokenApi');
  if (tokenApi && isEncrypted(tokenApi)) {
    const decrypted = await decryptObject(tokenApi, masterPassword);
    config.set('firefly:tokenApi', decrypted);
  }
}

export default async function loadConfig(path) {
  config
    .remove('defaults')
    .env({
      transform: (obj) => {
        if (!envMap[obj.key]) {
          return null;
        }
        // eslint-disable-next-line no-param-reassign
        obj.key = envMap[obj.key];
        return obj;
      },
    })
    .file({
      file: path,
      format: nconfYaml,
    })
    .defaults(require('../config/default.json'));

  // Apply env as top-priority overrides so addon/Docker env vars are always used (nconf .set() is not reliable across the chain)
  const envOverrides = {};
  if (process.env.FIREFLY_BASE_URL || process.env.FIREFLY_TOKEN_API) {
    envOverrides.firefly = {
      baseUrl: process.env.FIREFLY_BASE_URL || config.get('firefly:baseUrl'),
      tokenApi: process.env.FIREFLY_TOKEN_API || config.get('firefly:tokenApi'),
    };
  }
  if (process.env.CRON) envOverrides.cron = process.env.CRON;
  if (process.env.LOG_LEVEL) envOverrides.log = { level: process.env.LOG_LEVEL };
  if (process.env.SCRAPER_TIMEOUT || process.env.SCRAPER_START_DATE) {
    const base = envOverrides.scraper || config.get('scraper') || {};
    envOverrides.scraper = {
      ...base,
      ...(process.env.SCRAPER_TIMEOUT && { timeout: parseInt(process.env.SCRAPER_TIMEOUT, 10) }),
      ...(process.env.SCRAPER_START_DATE && { startDate: process.env.SCRAPER_START_DATE }),
    };
  }
  if (Object.keys(envOverrides).length > 0) {
    config.overrides(envOverrides);
  }

  config.required(['firefly', 'firefly:baseUrl', 'firefly:tokenApi', 'banks']);

  // Apply environment variable overrides for credentials
  // (These take precedence over config file values)
  applyCredentialEnvOverrides();

  // Check if decryption is needed
  const banks = config.get('banks');
  const tokenApi = config.get('firefly:tokenApi');
  const needsDecryption = hasEncryptedValues(banks) || isEncrypted(tokenApi);

  if (needsDecryption) {
    const masterPassword = process.env.MASTER_PASSWORD;

    if (!masterPassword) {
      throw new Error(
        'Encrypted credentials detected but MASTER_PASSWORD environment variable is not set.\n'
        + 'Please set MASTER_PASSWORD to decrypt credentials.',
      );
    }

    try {
      await decryptBanksConfig(masterPassword);
      await decryptFireflyConfig(masterPassword);
    } catch (error) {
      throw new Error(
        `Failed to decrypt credentials: ${error.message}\n`
        + 'Please verify your MASTER_PASSWORD is correct.',
      );
    }
  }
}
