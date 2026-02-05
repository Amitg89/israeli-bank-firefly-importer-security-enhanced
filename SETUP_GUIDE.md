# Step-by-Step Setup Guide: Secure Credentials Encryption

This guide walks you through setting up encrypted credentials for the Israeli Bank Firefly Importer.

---

## Prerequisites

- Node.js 18 or higher installed
- Your bank credentials ready
- Firefly III instance running with API token

---

## Step 1: Install/Update the Importer

If not already installed:

```bash
npm install -g israeli-bank-firefly-importer
```

Or if updating an existing installation:

```bash
npm update -g israeli-bank-firefly-importer
```

---

## Step 2: Create Your Configuration File

Create a file named `config.yaml` with your credentials:

```yaml
# Firefly III Configuration
firefly:
  baseUrl: 'http://your-firefly-server:8080'  # Your Firefly III URL
  tokenApi: 'your-firefly-api-token-here'     # Get from Firefly: Options → Profile → OAuth → Personal Access Tokens

# Bank Accounts Configuration
banks:
  # Bank 1: Leumi (example)
  - type: leumi
    credentials:
      username: 'your-bank-username'
      password: 'your-bank-password'
    
    # Credit cards linked to this bank
    creditCards:
      # Credit Card 1: Isracard
      - type: isracard
        credentials:
          id: '123456789'           # Your ID number
          card6Digits: '123456'     # First 6 digits of card
          password: 'your-isracard-password'
      
      # Credit Card 2: Visa Cal (optional)
      - type: visaCal
        credentials:
          username: 'your-visacal-username'
          password: 'your-visacal-password'

# Schedule (optional) - Run every day at 6 AM
cron: '0 6 * * *'
```

### Supported Bank Types

| Bank | Type Value |
|------|------------|
| Leumi | `leumi` |
| Hapoalim | `hapoalim` |
| Discount | `discount` |
| Mizrahi | `mizrahi` |
| Beinleumi | `beinleumi` |
| Otsar Hahayal | `otsar-hahayal` |
| Massad | `massad` |
| Yahav | `yahav` |

### Supported Credit Card Types

| Credit Card | Type Value |
|-------------|------------|
| Isracard | `isracard` |
| Visa Cal | `visaCal` |
| Max | `max` |
| Amex | `amex` |

---

## Step 3: Encrypt Your Configuration

Run the encryption tool:

```bash
israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml
```

You will see:

```
Reading configuration from: config.yaml

The following sensitive fields will be encrypted:
  - firefly.tokenApi
  - banks[0].credentials.username
  - banks[0].credentials.password
  - banks[0].creditCards[0].credentials.id
  - banks[0].creditCards[0].credentials.card6Digits
  - banks[0].creditCards[0].credentials.password

Proceed with encryption? (y/N): y
Enter master password: ****************
Confirm master password: ****************

Encrypting sensitive fields...

Success! Encrypted 6 sensitive field(s).
Output written to: config.encrypted.yaml

IMPORTANT:
  1. Delete or secure the original plaintext config file
  2. Set MASTER_PASSWORD environment variable for automated runs
  3. Update CONFIG_FILE to point to the encrypted file
```

### Choosing a Strong Master Password

Your master password should be:
- At least 16 characters long
- Mix of uppercase, lowercase, numbers, and symbols
- NOT reused from any other service
- Stored safely (password manager recommended)

Example of a strong password: `K9#mP2$xL5@nQ8&vR3`

---

## Step 4: Delete the Plaintext Config

**IMPORTANT:** Remove the original unencrypted file:

```bash
rm config.yaml
```

Or if you want to keep a backup, encrypt it separately:

```bash
# Using GPG (optional)
gpg -c config.yaml
rm config.yaml
```

---

## Step 5: Verify Your Encrypted Config

Your `config.encrypted.yaml` should now look like this:

```yaml
firefly:
  baseUrl: 'http://your-firefly-server:8080'
  tokenApi: 'encrypted:v1:7Kx9mP2L5nQ8vR3...(long base64 string)...'
banks:
  - type: leumi
    credentials:
      username: 'encrypted:v1:8Jy0nQ3M6oR9wS4...(long base64 string)...'
      password: 'encrypted:v1:9Kz1oR4N7pS0xT5...(long base64 string)...'
    creditCards:
      - type: isracard
        credentials:
          id: 'encrypted:v1:0La2pS5O8qT1yU6...(long base64 string)...'
          card6Digits: 'encrypted:v1:1Mb3qT6P9rU2zV7...(long base64 string)...'
          password: 'encrypted:v1:2Nc4rU7Q0sV3aW8...(long base64 string)...'
cron: '0 6 * * *'
```

---

## Step 6: Test the Configuration

Test that decryption works:

```bash
export MASTER_PASSWORD='your-master-password'
export CONFIG_FILE='./config.encrypted.yaml'
israeli-bank-firefly-importer
```

You should see the importer start successfully and begin scraping your accounts.

---

## Step 7: Home Assistant Addon Setup

### Option A: Using Home Assistant Secrets (Recommended)

1. **Add master password to HA secrets:**

   Edit `/config/secrets.yaml`:
   ```yaml
   bank_importer_master_password: 'your-master-password'
   ```

2. **Copy encrypted config to HA:**

   Place your `config.encrypted.yaml` in:
   ```
   /config/israeli-bank-firefly-importer/config.encrypted.yaml
   ```

3. **Configure the addon:**

   In the addon configuration:
   - `config_file`: `/config/israeli-bank-firefly-importer/config.encrypted.yaml`
   
4. **Set MASTER_PASSWORD environment variable:**

   You'll need to modify the addon's run.sh or pass it via the addon config.
   Check the addon repository for specific instructions.

### Option B: Direct Environment Variables

If you prefer not to use encrypted files, you can pass credentials via environment variables:

```bash
# Set in addon configuration or shell
export FIREFLY_BASE_URL='http://your-firefly:8080'
export FIREFLY_TOKEN_API='your-api-token'
export BANK_0_USERNAME='your-bank-username'
export BANK_0_PASSWORD='your-bank-password'
export BANK_0_CC_0_ID='123456789'
export BANK_0_CC_0_CARD6DIGITS='123456'
export BANK_0_CC_0_PASSWORD='your-cc-password'
```

---

## Step 8: Set File Permissions

Secure your configuration files:

```bash
# Linux/macOS - restrict to owner only
chmod 600 /config/israeli-bank-firefly-importer/config.encrypted.yaml
chmod 600 /config/secrets.yaml
```

---

## Step 9: Verify Scheduled Runs

If using CRON scheduling:

1. Check addon logs after the scheduled time
2. Verify new transactions appear in Firefly III
3. Monitor for any error messages

---

## Troubleshooting

### Error: "MASTER_PASSWORD environment variable is not set"

**Solution:** Set the environment variable before running:
```bash
export MASTER_PASSWORD='your-password'
```

### Error: "Failed to decrypt credentials: Invalid master password"

**Causes:**
- Typo in master password
- Using wrong password
- Config was encrypted with different password

**Solution:** Re-encrypt with the correct password:
```bash
israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml
```

### Error: "No sensitive fields found to encrypt"

**Causes:**
- Config already encrypted
- Missing credentials sections

**Solution:** Check your config has `credentials:` sections with actual values.

### Importer runs but no transactions imported

**Check:**
1. Bank credentials are correct
2. Firefly API token is valid
3. Check logs for scraping errors

---

## Updating Credentials

If you need to change a password:

1. **Create new plaintext config** with updated credentials
2. **Re-encrypt:**
   ```bash
   israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml
   ```
3. **Delete plaintext config:**
   ```bash
   rm config.yaml
   ```
4. **Restart the addon** to load new config

---

## Changing Master Password

To change your master password:

1. **Decrypt current config** (you'll need the old password)
2. **Re-encrypt with new password:**
   ```bash
   israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml
   ```
3. **Update MASTER_PASSWORD** environment variable everywhere it's used
4. **Delete plaintext config**

---

## Quick Reference

| Task | Command |
|------|---------|
| Encrypt config | `israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml` |
| Encrypt single value | `israeli-bank-firefly-encrypt --encrypt-value` |
| Run importer | `MASTER_PASSWORD=xxx CONFIG_FILE=config.encrypted.yaml israeli-bank-firefly-importer` |
| View help | `israeli-bank-firefly-encrypt --help` |

---

## Security Checklist

Before going live, verify:

- [ ] Original plaintext config.yaml is deleted
- [ ] Master password is stored securely (HA secrets or password manager)
- [ ] File permissions are set to 600
- [ ] Home Assistant has 2FA enabled
- [ ] Cloudflare Access is configured (if exposed to internet)
- [ ] Scheduled runs are working correctly

---

## Need Help?

- Check [SECURITY.md](SECURITY.md) for detailed security information
- Review the [main README](README.md) for general usage
- Open an issue on GitHub for bugs or questions
