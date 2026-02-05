# Israeli Bank Firefly III Importer - Security Enhanced

> **This is a security-enhanced fork of [israeli-bank-firefly-importer](https://github.com/itairaz1/israeli-bank-firefly-importer) by [Itai Raz](https://github.com/itairaz1).**

## Credits & Acknowledgments

This project is built upon the excellent work of **[Itai Raz](https://github.com/itairaz1)** and the original [israeli-bank-firefly-importer](https://github.com/itairaz1/israeli-bank-firefly-importer) project. All core functionality for scraping Israeli banks and importing to Firefly III comes from the original project.

**Original Project:** https://github.com/itairaz1/israeli-bank-firefly-importer

The original project uses [Israeli Bank Scrapers](https://github.com/eshaham/israeli-bank-scrapers) by [Eran Shaham](https://github.com/eshaham) to scrape bank data and imports it into [Firefly III](https://www.firefly-iii.org/).

---

## What This Fork Adds: Security Enhancements

This fork focuses on **securing sensitive bank credentials** for users who expose their Home Assistant to the internet (e.g., via Cloudflare Tunnel). The original project stores credentials in plaintext YAML files, which poses security risks if the configuration file is compromised.

### Security Features Added

| Feature | Description |
|---------|-------------|
| **AES-256-GCM Encryption** | Bank credentials and API tokens can now be encrypted at rest |
| **PBKDF2 Key Derivation** | Master password is never stored; encryption key derived with 100,000 iterations |
| **CLI Encryption Tool** | Easy-to-use command-line tool to encrypt your configuration |
| **Environment Variable Support** | All credentials can be provided via environment variables |
| **Comprehensive Log Redaction** | 21 redaction patterns to prevent credential leakage in logs |
| **Security Documentation** | Detailed guides for secure setup and best practices |

### Threat Protection

| Threat | Protection |
|--------|------------|
| Config file accidentally pushed to Git | Protected - credentials encrypted |
| Config file stolen from backup | Protected - credentials encrypted |
| Config file accessed by other processes | Protected - needs master password |
| Credentials appearing in logs | Protected - comprehensive redaction |

---

## Quick Start (Secure Setup)

### 1. Install

```bash
npm install -g israeli-bank-firefly-importer-security-enhanced
```

### 2. Create Configuration

Create `config.yaml` with your credentials:

```yaml
firefly:
  baseUrl: 'http://your-firefly:8080'
  tokenApi: 'your-api-token'

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
          password: 'your-password'

cron: '0 6 * * *'
```

### 3. Encrypt Your Configuration

```bash
israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml
```

You'll be prompted to create a strong master password.

### 4. Delete Plaintext Config

```bash
rm config.yaml
```

### 5. Run with Master Password

```bash
export MASTER_PASSWORD='your-master-password'
export CONFIG_FILE='./config.encrypted.yaml'
israeli-bank-firefly-importer
```

For detailed setup instructions, see [SETUP_GUIDE.md](SETUP_GUIDE.md).

For security best practices, see [SECURITY.md](SECURITY.md).

---

## Original Features (from upstream)

All features from the original project are preserved:

1. Import transactions from Israeli banks and credit card sites into Firefly III
2. Incremental imports - only missing transactions are imported
3. Automatic credit card transfer transaction handling
4. CRON scheduling for periodic imports

## Supported Accounts

### Banks
- Leumi
- Hapoalim
- Discount
- Mizrahi
- Beinleumi
- Otsar Hahayal
- Massad
- Yahav

### Credit Cards
- Isracard
- Visa Cal
- Max
- Amex

For the full support list, see the [Israeli Bank Scrapers documentation](https://github.com/eshaham/israeli-bank-scrapers#whats-here).

---

## Environment Variables

### Security Variables (New)

| Variable | Description |
|----------|-------------|
| `MASTER_PASSWORD` | Master password for decrypting credentials |
| `BANK_N_USERNAME` | Username for bank N (0-indexed) |
| `BANK_N_PASSWORD` | Password for bank N |
| `BANK_N_CC_M_USERNAME` | Username for bank N, credit card M |
| `BANK_N_CC_M_PASSWORD` | Password for bank N, credit card M |

### Original Variables

| Variable | Description |
|----------|-------------|
| `CONFIG_FILE` | Path to configuration file |
| `FIREFLY_BASE_URL` | Firefly III base URL |
| `FIREFLY_TOKEN_API` | Firefly III API token |
| `CRON` | Cron expression for scheduling |

---

## CLI Tools

### Encryption Tool (New)

```bash
# Encrypt a config file
israeli-bank-firefly-encrypt -i config.yaml -o config.encrypted.yaml

# Encrypt a single value
israeli-bank-firefly-encrypt --encrypt-value

# Show help
israeli-bank-firefly-encrypt --help
```

### Importer (Original)

```bash
israeli-bank-firefly-importer
```

---

## Docker Usage

```bash
docker run \
  -e MASTER_PASSWORD='your-master-password' \
  -v /path/to/config.encrypted.yaml:/home/pptruser/app/config.yaml \
  your-image:tag
```

---

## Home Assistant Addon

For Home Assistant integration, you'll need to:

1. Use the encrypted config file
2. Set `MASTER_PASSWORD` in the addon environment
3. See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions

The original addon repository: [israeli-bank-firefly-importer-hass-addon](https://github.com/itairaz1/israeli-bank-firefly-importer-hass-addon)

---

## Contributing

### To This Fork (Security Features)
For security-related improvements, please open issues or PRs in this repository.

### To Core Functionality
For improvements to the core import functionality, please contribute to the [original project](https://github.com/itairaz1/israeli-bank-firefly-importer).

---

## Report a Bug

**For security-related bugs:** Open an issue in this repository

**For import/scraping bugs:** Please report to the [original project](https://github.com/itairaz1/israeli-bank-firefly-importer/issues/new)

---

## License

[MIT License](LICENSE)

This project is a fork of [israeli-bank-firefly-importer](https://github.com/itairaz1/israeli-bank-firefly-importer) which is also MIT licensed.

---

## Disclaimer

This software handles sensitive banking credentials. While security enhancements have been implemented, **use at your own risk**. Always:

- Keep your master password secure
- Regularly update your credentials
- Monitor your bank accounts for unauthorized access
- Keep your Home Assistant and all addons updated

The authors are not responsible for any unauthorized access to your accounts.
