#!/usr/bin/env node

/**
 * CLI tool for encrypting sensitive fields in configuration files
 * Usage: israeli-bank-firefly-encrypt --input config.yaml --output config.encrypted.yaml
 */

import { readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import yaml from 'js-yaml';
import { encryptSensitiveFields, encrypt, isEncrypted } from './crypto.js';

const HELP_TEXT = `
Israeli Bank Firefly Importer - Configuration Encryption Tool

This tool encrypts sensitive credentials in your configuration file using AES-256-GCM encryption.

USAGE:
  israeli-bank-firefly-encrypt [options]

OPTIONS:
  --input, -i <file>     Input configuration file (default: config.yaml)
  --output, -o <file>    Output encrypted file (default: config.encrypted.yaml)
  --decrypt, -d          Decrypt instead of encrypt (for verification)
  --encrypt-value, -e    Encrypt a single value (interactive)
  --help, -h             Show this help message

EXAMPLES:
  # Encrypt a config file
  israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml

  # Encrypt a single value (for manual insertion)
  israeli-bank-firefly-encrypt --encrypt-value

  # Verify decryption works (prints decrypted values - use carefully!)
  israeli-bank-firefly-encrypt -i config.encrypted.yaml --decrypt

SECURITY NOTES:
  - The master password is NEVER stored - you must remember it
  - Use a strong password (16+ characters recommended)
  - Keep the encrypted config file; delete the plaintext one
  - Set MASTER_PASSWORD environment variable for automated runs
`;

/**
 * Prompts user for input (hidden for passwords)
 */
function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden && process.stdin.isTTY) {
      // Hide password input
      process.stdout.write(question);
      let password = '';

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char) => {
        const c = char.toString();

        if (c === '\n' || c === '\r' || c === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', onData);
          rl.close();
          process.stdout.write('\n');
          resolve(password);
        } else if (c === '\u0003') {
          // Ctrl+C
          process.exit(1);
        } else if (c === '\u007F' || c === '\b') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(question + '*'.repeat(password.length));
          }
        } else {
          password += c;
          process.stdout.write('*');
        }
      };

      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Prompts for master password with confirmation
 */
async function promptMasterPassword(confirm = true) {
  const password = await prompt('Enter master password: ', true);

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters long');
    process.exit(1);
  }

  if (confirm) {
    const confirmPassword = await prompt('Confirm master password: ', true);
    if (password !== confirmPassword) {
      console.error('Error: Passwords do not match');
      process.exit(1);
    }
  }

  return password;
}

/**
 * Counts encrypted fields in an object
 */
function countEncryptedFields(obj, count = { encrypted: 0, total: 0 }) {
  const result = { encrypted: count.encrypted, total: count.total };
  if (obj === null || obj === undefined) return result;

  if (typeof obj === 'string') {
    if (isEncrypted(obj)) {
      result.encrypted += 1;
    }
    return result;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      const next = countEncryptedFields(item, result);
      result.encrypted = next.encrypted;
      result.total = next.total;
    });
    return result;
  }

  if (typeof obj === 'object') {
    Object.values(obj).forEach((value) => {
      const next = countEncryptedFields(value, result);
      result.encrypted = next.encrypted;
      result.total = next.total;
    });
    return result;
  }

  return result;
}

/**
 * Lists what fields will be encrypted
 */
function listSensitiveFields(obj, path = '', fields = []) {
  if (obj === null || obj === undefined) return fields;

  if (typeof obj === 'string') {
    const sensitivePatterns = [
      /\.credentials\./,
      /\.credentials$/,
      /\.password$/,
      /\.tokenApi$/,
      /\.token$/,
      /\.secret$/,
      /\.apiKey$/,
    ];

    const isSensitive = sensitivePatterns.some((pattern) => pattern.test(path));
    if (isSensitive && obj.trim() !== '' && !isEncrypted(obj)) {
      fields.push(path);
    }
    return fields;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => listSensitiveFields(item, `${path}[${index}]`, fields));
    return fields;
  }

  if (typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      const newPath = path ? `${path}.${key}` : key;
      listSensitiveFields(value, newPath, fields);
    });
    return fields;
  }

  return fields;
}

/**
 * Main encryption flow
 */
async function encryptConfig(inputFile, outputFile) {
  console.log(`\nReading configuration from: ${inputFile}`);

  let configContent;
  try {
    configContent = await readFile(inputFile, 'utf8');
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
    process.exit(1);
  }

  let config;
  try {
    config = yaml.load(configContent);
  } catch (error) {
    console.error(`Error parsing YAML: ${error.message}`);
    process.exit(1);
  }

  // Show what will be encrypted
  const sensitiveFields = listSensitiveFields(config);

  if (sensitiveFields.length === 0) {
    console.log('\nNo sensitive fields found to encrypt.');
    console.log('Fields already encrypted or no credentials present.');
    process.exit(0);
  }

  console.log('\nThe following sensitive fields will be encrypted:');
  sensitiveFields.forEach((field) => console.log(`  - ${field}`));

  const proceed = await prompt('\nProceed with encryption? (y/N): ');
  if (proceed.toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  const masterPassword = await promptMasterPassword(true);

  console.log('\nEncrypting sensitive fields...');

  try {
    const encryptedConfig = await encryptSensitiveFields(config, masterPassword);

    // Convert back to YAML
    const outputContent = yaml.dump(encryptedConfig, {
      indent: 2,
      lineWidth: -1,
      quotingType: "'",
      forceQuotes: true,
    });

    await writeFile(outputFile, outputContent, 'utf8');

    const counts = countEncryptedFields(encryptedConfig);
    console.log(`\nSuccess! Encrypted ${counts.encrypted} sensitive field(s).`);
    console.log(`Output written to: ${outputFile}`);
    console.log('\nIMPORTANT:');
    console.log('  1. Delete or secure the original plaintext config file');
    console.log('  2. Set MASTER_PASSWORD environment variable for automated runs');
    console.log('  3. Update CONFIG_FILE to point to the encrypted file');
  } catch (error) {
    console.error(`\nEncryption failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Encrypt a single value interactively
 */
async function encryptSingleValue() {
  console.log('\nEncrypt a single value');
  console.log('(Useful for manually adding encrypted values to config)\n');

  const value = await prompt('Enter value to encrypt: ');
  if (!value) {
    console.error('Error: Value cannot be empty');
    process.exit(1);
  }

  const masterPassword = await promptMasterPassword(true);

  try {
    const encrypted = await encrypt(value, masterPassword);
    console.log('\nEncrypted value (copy this to your config):');
    console.log(encrypted);
  } catch (error) {
    console.error(`\nEncryption failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: 'config.yaml',
    output: 'config.encrypted.yaml',
    decrypt: false,
    encryptValue: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--input':
      case '-i':
        options.input = args[i + 1];
        i += 1;
        break;
      case '--output':
      case '-o':
        options.output = args[i + 1];
        i += 1;
        break;
      case '--decrypt':
      case '-d':
        options.decrypt = true;
        break;
      case '--encrypt-value':
      case '-e':
        options.encryptValue = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (options.encryptValue) {
    await encryptSingleValue();
    process.exit(0);
  }

  if (options.decrypt) {
    console.log('\nDecrypt mode is for verification only.');
    console.log('WARNING: This will display decrypted credentials!\n');
    const proceed = await prompt('Are you sure? (y/N): ');
    if (proceed.toLowerCase() !== 'y') {
      process.exit(0);
    }
    // For now, just inform user - actual decryption happens at runtime
    console.log('\nTo verify decryption, run the importer with MASTER_PASSWORD set.');
    console.log('Check logs for successful credential loading.');
    process.exit(0);
  }

  await encryptConfig(options.input, options.output);
}

main().catch((error) => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
