// eslint-disable-next-line import/no-unresolved
import { CompanyTypes, createScraper } from 'israeli-bank-scrapers';
import config from 'nconf';
import moment from 'moment';
import logger from '../logger.js';
import { getLastImport } from './last-import-helper.js';
import manipulateScrapResult from './scrap-manipulater/index.js';

function toUserOptions(item, index) {
  return {
    type: item.type,
    credentials: item.credentials,
    ...(index !== undefined && { parentBankIndex: index }),
    name: item.name,
    startDate: item.startDate,
    timeout: item.timeout,
  };
}

function enrichAccount(accounts, currentAccount) {
  const accountDetails = currentAccount.parentBankIndex !== undefined ? {
    type: currentAccount.type,
    kind: 'credit-card',
  } : {
    type: currentAccount.type,
    kind: 'bank',
  };
  return accounts.map((x) => ({
    ...x,
    accountDetails,
  }));
}

function getScrapFrom(account) {
  let fallback = account.lastImport
    ? moment(account.lastImport).subtract(7, 'days')
    : moment().subtract(5, 'years');

  // Optional global minimum start date (limits how far back we scrape)
  const configuredStart = config.get('scraper:startDate');
  if (configuredStart) {
    const configuredMoment = moment(configuredStart);
    if (configuredMoment.isValid() && fallback.isBefore(configuredMoment)) {
      fallback = configuredMoment;
    }
  }

  // Per-account start date (e.g. limit Isracard to 1 year to avoid timeout)
  if (account.startDate) {
    const accountStart = moment(account.startDate);
    if (accountStart.isValid() && fallback.isBefore(accountStart)) {
      fallback = accountStart;
    }
  }

  if (logger().level === 'debug') {
    logger().debug({
      accountType: account.type,
      scrapFrom: fallback.toISOString(),
      configuredStartDate: configuredStart || null,
      accountStartDate: account.startDate || null,
    }, 'Scrap start date');
  }
  return fallback;
}

export function getFlatUsers(useOnlyAccounts, state, since) {
  if (!config.get('banks')) {
    throw new Error('No banks in config');
  }
  return config.get('banks')
    .flatMap((bank, i) => ([toUserOptions(bank), ...(bank.creditCards || [])
      .map((cc) => toUserOptions(cc, i))]))
    .filter((x) => !useOnlyAccounts || useOnlyAccounts.includes(x.name))
    .map((x) => ({
      ...x,
      lastImport: getLastImport(x, state, since),
    }))
    .map((x) => ({
      ...x,
      scrapFrom: getScrapFrom(x),
    }));
}

export function parseScrapResult(results, flatUsers) {
  return results
    .reduce((m, x, i) => ([...m, ...(enrichAccount(x.accounts || [], flatUsers[i]))]), [])
    .map(manipulateScrapResult)
    .filter((x) => x);
}

export function getSuccessfulScrappedUsers(results, flatUsers) {
  return results
    .map((x, i) => (x.success ? flatUsers[i] : null))
    .filter((x) => x);
}

export function logErrorResult(results, flatUsers) {
  const error = results
    .map((x, i) => (x.success ? null : ({
      ...x,
      options: flatUsers[i],
    })))
    .filter((x) => x)
    .map((x) => `${x.options.type} ${x.options.name ? ` (${x.options.name})` : ''} failed with type ${x.errorType}: ${x.errorMessage}`)
    .join(', ');
  if (error) {
    logger()
      .error(error, 'Scrapping failed. Ignoring...');
  }
}

export function getLightResult(results) {
  return results.map((r) => ({
    ...r,
    accounts: r.accounts
      ?.map((a) => ({
        ...a,
        txCount: a.txns.length,
        txns: undefined,
      })),
  }));
}

export async function scrapAccounts(flatUsers) {
  const scraperConfig = config.get('scraper');
  const actions = flatUsers
    .map((user) => {
      const options = {
        companyId: CompanyTypes[user.type],
        startDate: user.scrapFrom.toDate(),
        ...scraperConfig.options,
        // Timeout: per-account overrides global (scrapers: max navigation ms, default 30000)
        ...(typeof (user.timeout ?? scraperConfig.timeout) === 'number' && {
          timeout: user.timeout ?? scraperConfig.timeout,
        }),
      };

      return () => scrape(options, user.credentials);
    });

  return runActions(actions, scraperConfig.parallel);
}

function isTimeoutError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const name = (error.name || '').toLowerCase();
  return name === 'timeouterror' || msg.includes('timeout') || msg.includes('navigation timeout');
}

async function scrape(options, credentials) {
  const scraper = createScraper(options);
  logger().debug({ options }, 'Scrapping...');
  try {
    return await scraper.scrape(credentials);
  } catch (error) {
    const isTimeout = isTimeoutError(error);
    logger().error(
      { error, options, errorType: isTimeout ? 'TIMEOUT' : 'GENERAL_ERROR' },
      isTimeout ? 'Scraping timed out (increase scraper_timeout in addon or scraper.timeout in config)' : 'Unexpected error while scrapping',
    );
    return {
      success: false,
      errorType: isTimeout ? 'TIMEOUT' : 'GENERAL_ERROR',
      errorMessage: error.message,
    };
  }
}

function runActions(actions, parallel) {
  if (parallel) {
    return Promise.all(actions.map((x) => x()));
  }
  return actions.reduce((m, a) => m.then(async (x) => [...x, await a()]), Promise.resolve([]));
}
