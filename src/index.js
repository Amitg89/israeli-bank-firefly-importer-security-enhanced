#!/usr/bin/env node

import { readFile } from 'fs/promises';
import config from 'nconf';
import { schedule } from 'node-cron';
import loadConfig from './load-config.js';
import doImport from './importer/index.js';
import logger, { init as loggerInit } from './logger.js';
import { init as fireFlyInit } from './firefly.js';

const packageJsonContent = await readFile(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(packageJsonContent.toString());

async function run() {
  try {
    await doImport({
      skipEdit: true,
      onlyAccounts: undefined,
      cleanup: false,
    });
  } catch (err) {
    logger()
      .error({
        error: err,
        message: err?.response?.data?.message,
      }, 'Fatal error');
  }
}

function logConfigSnapshot() {
  const configFile = process.env.CONFIG_FILE || './config.yaml';
  const scraper = config.get('scraper') || {};
  const banks = config.get('banks') || [];
  const snapshot = {
    configFile,
    scraperStartDate: scraper.startDate ?? null,
    scraperTimeout: scraper.timeout ?? null,
    banks: banks.map((b, i) => ({
      index: i,
      type: b.type,
      startDate: b.startDate ?? null,
      timeout: b.timeout ?? null,
      creditCards: (b.creditCards || []).map((cc, j) => ({
        index: j,
        type: cc.type,
        startDate: cc.startDate ?? null,
        timeout: cc.timeout ?? null,
      })),
    })),
  };
  logger().info(snapshot, 'Config snapshot (startDate/timeout only)');
}

async function init() {
  const configFile = process.env.CONFIG_FILE || './config.yaml';
  await loadConfig(configFile);
  loggerInit();
  logger().debug(`Config file '${configFile}' loaded.`);
  logConfigSnapshot();

  fireFlyInit();
}

try {
  await init();
  logger()
    .info(
      {
        version: pkg.version,
        features: ['per-account startDate', 'per-account timeout'],
        configFile: process.env.CONFIG_FILE || './config.yaml',
      },
      'Starting Israeli Bank Firefly iii Importer',
    );
  await run();
  const cron = config.get('cron');
  if (cron) {
    logger()
      .info({ cron }, 'Running with cron');
    schedule(cron, run);
  }
} catch (err) {
  // Always print to stderr so addon/container logs show the error even if logger not inited
  console.error('Critical error:', err?.message || err);
  try {
    logger().error(err, 'Critical error');
  } catch (_) {
    console.error(err);
  }
  process.exitCode = 1;
}
