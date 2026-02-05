# Security Guide

This guide explains how to securely store your bank credentials when using the Israeli Bank Firefly Importer.

## Overview

The importer supports **AES-256-GCM encryption** for sensitive credentials. This means your bank usernames, passwords, and API tokens can be stored in encrypted form, protected by a master password.

### Security Features

- **AES-256-GCM**: Military-grade encryption algorithm
- **PBKDF2 Key Derivation**: 100,000 iterations with SHA-256
- **Unique Salt & IV**: Every encryption uses random values
- **Authentication Tag**: Detects tampering attempts
- **Log Redaction**: Credentials are automatically redacted from logs

## Quick Start

### Step 1: Create Your Configuration File

Create a `config.yaml` with your credentials in plaintext (we'll encrypt it next):

```yaml
firefly:
  baseUrl: 'http://your-firefly-instance:8080'
  tokenApi: 'your-firefly-api-token'

banks:
  - type: leumi
    credentials:
      username: 'your-username'
      password: 'your-password'
    creditCards:
      - type: isracard
        credentials:
          id: '123456789'
          card6Digits: '123456'
          password: 'your-cc-password'

cron: '0 6 * * *'
```

### Step 2: Encrypt the Configuration

Run the encryption tool:

```bash
israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml
```

You'll be prompted to:
1. Review which fields will be encrypted
2. Enter a master password (minimum 8 characters, 16+ recommended)
3. Confirm the master password

**Output:**
```
The following sensitive fields will be encrypted:
  - firefly.tokenApi
  - banks[0].credentials.username
  - banks[0].credentials.password
  - banks[0].creditCards[0].credentials.id
  - banks[0].creditCards[0].credentials.card6Digits
  - banks[0].creditCards[0].credentials.password

Success! Encrypted 6 sensitive field(s).
Output written to: config.encrypted.yaml
```

### Step 3: Secure the Original File

**IMPORTANT:** Delete or securely store the original plaintext `config.yaml`:

```bash
# Option 1: Delete it
rm config.yaml

# Option 2: Move to encrypted backup
gpg -c config.yaml  # Encrypt with GPG
rm config.yaml
```

### Step 4: Set Environment Variables

Set the master password and config file path:

```bash
# For manual runs
export MASTER_PASSWORD='your-strong-master-password'
export CONFIG_FILE='./config.encrypted.yaml'
israeli-bank-firefly-importer
```

### Step 5: Home Assistant Addon Configuration

In your Home Assistant addon configuration:

1. Set `config_file` to your encrypted config path
2. Add `MASTER_PASSWORD` to the addon's environment variables

**Option A: In addon configuration UI:**
- Config file: `/config/israeli-bank-firefly-importer/config.encrypted.yaml`

**Option B: Using Home Assistant secrets:**

In `secrets.yaml`:
```yaml
bank_importer_master_password: 'your-strong-master-password'
```

Then reference it in your addon config or automation.

## Encrypted Config Format

After encryption, your config will look like this:

```yaml
firefly:
  baseUrl: 'http://your-firefly-instance:8080'
  tokenApi: 'encrypted:v1:base64encodeddata...'

banks:
  - type: leumi
    credentials:
      username: 'encrypted:v1:base64encodeddata...'
      password: 'encrypted:v1:base64encodeddata...'
    creditCards:
      - type: isracard
        credentials:
          id: 'encrypted:v1:base64encodeddata...'
          card6Digits: 'encrypted:v1:base64encodeddata...'
          password: 'encrypted:v1:base64encodeddata...'
```

## Alternative: Environment Variables Only

You can also provide credentials entirely via environment variables (no encryption needed):

```bash
# Firefly
export FIREFLY_BASE_URL='http://your-firefly-instance:8080'
export FIREFLY_TOKEN_API='your-api-token'

# Bank 0 credentials
export BANK_0_USERNAME='your-username'
export BANK_0_PASSWORD='your-password'

# Bank 0, Credit Card 0 credentials
export BANK_0_CC_0_ID='123456789'
export BANK_0_CC_0_CARD6DIGITS='123456'
export BANK_0_CC_0_PASSWORD='your-cc-password'

# Still need a minimal config.yaml for bank types
export CONFIG_FILE='./config-types-only.yaml'
israeli-bank-firefly-importer
```

Minimal `config-types-only.yaml`:
```yaml
firefly:
  baseUrl: ''  # Will be overridden by env
  tokenApi: ''  # Will be overridden by env

banks:
  - type: leumi
    credentials: {}  # Will be overridden by env
    creditCards:
      - type: isracard
        credentials: {}  # Will be overridden by env
```

## Environment Variable Reference

| Variable | Description |
|----------|-------------|
| `MASTER_PASSWORD` | Master password for decrypting credentials |
| `CONFIG_FILE` | Path to configuration file |
| `FIREFLY_BASE_URL` | Firefly III base URL |
| `FIREFLY_TOKEN_API` | Firefly III API token |
| `BANK_N_USERNAME` | Username for bank N (0-indexed) |
| `BANK_N_PASSWORD` | Password for bank N |
| `BANK_N_ID` | ID for bank N (if required) |
| `BANK_N_USERCODE` | User code for bank N (if required) |
| `BANK_N_CC_M_USERNAME` | Username for bank N, credit card M |
| `BANK_N_CC_M_PASSWORD` | Password for bank N, credit card M |
| `BANK_N_CC_M_ID` | ID for bank N, credit card M |
| `BANK_N_CC_M_CARD6DIGITS` | Card 6 digits for bank N, credit card M |

## CLI Tool Reference

### Encrypt a Configuration File

```bash
israeli-bank-firefly-encrypt -i <input> -o <output>
```

Options:
- `-i, --input <file>`: Input config file (default: `config.yaml`)
- `-o, --output <file>`: Output encrypted file (default: `config.encrypted.yaml`)

### Encrypt a Single Value

For manually adding encrypted values:

```bash
israeli-bank-firefly-encrypt --encrypt-value
```

### Get Help

```bash
israeli-bank-firefly-encrypt --help
```

## Security Best Practices

### Master Password Guidelines

- **Minimum 16 characters** recommended
- Use a mix of uppercase, lowercase, numbers, and symbols
- Do NOT reuse passwords from other services
- Consider using a password manager to generate and store it

### File Permissions

Restrict access to configuration files:

```bash
# Linux/macOS
chmod 600 config.encrypted.yaml
chmod 600 secrets.yaml

# Verify
ls -la config.encrypted.yaml
# Should show: -rw------- (only owner can read/write)
```

### Home Assistant Security

1. **Enable 2FA** on your Home Assistant account
2. **Use Cloudflare Access** to add authentication before HA login
3. **Keep HA updated** - security patches are important
4. **Review addon permissions** - limit what addons can access
5. **Monitor logs** for suspicious activity

### Cloudflare Tunnel Hardening

If exposing HA via Cloudflare:

1. **Never expose your origin IP** directly
2. **Use Cloudflare Access policies** to require authentication
3. **Enable Bot Fight Mode** in Cloudflare dashboard
4. **Set up firewall rules** to block direct IP access
5. **Monitor Cloudflare analytics** for unusual traffic

### Credential Rotation

Periodically update your credentials:

1. Change bank passwords every 6-12 months
2. Regenerate Firefly API tokens periodically
3. Update master password if you suspect compromise
4. Re-encrypt config after changing master password

## Threat Model

### What This Protects Against

| Threat | Protection Level |
|--------|-----------------|
| Config file accidentally committed to Git | **PROTECTED** |
| Config file stolen from backup | **PROTECTED** |
| Config file read by other HA addons | **PROTECTED** |
| Partial system access (read-only) | **PROTECTED** |
| Credentials appearing in logs | **PROTECTED** |

### What This Does NOT Protect Against

| Threat | Mitigation |
|--------|------------|
| Full root access to running system | Use separate secrets server |
| Memory dump while addon runs | Hardware security module |
| Keylogger capturing master password | Physical security |
| Social engineering | User awareness |

## Troubleshooting

### "Encrypted credentials detected but MASTER_PASSWORD is not set"

Solution: Set the `MASTER_PASSWORD` environment variable before running.

### "Failed to decrypt credentials: Invalid master password"

Causes:
1. Wrong master password
2. Corrupted encrypted config file
3. Config was encrypted with a different password

Solution: Re-encrypt with the correct password or verify your password.

### "No sensitive fields found to encrypt"

Causes:
1. Fields are already encrypted
2. Config file has no credentials section

Solution: Check that your config has `credentials` sections with actual values.

## Support

If you encounter security issues or vulnerabilities, please report them responsibly:

1. Do NOT open public GitHub issues for security vulnerabilities
2. Contact the maintainer directly
3. Allow time for a fix before public disclosure
