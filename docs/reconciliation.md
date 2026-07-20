# Balance reconciliation

When `reconcileBalance` is enabled, the importer compares each **bank** account's
scraped balance against its Firefly III balance after every import, and posts a
`reconciliation`-type transaction for the difference (tagged `balance-adjustment`).

Credit-card (`ccAsset`) accounts are **never** reconciled: the scraper reports the
current billing-cycle balance, while Firefly holds the lifetime transaction sum, so
the two are not comparable.

## One-time setup per bank account (Firefly 6.x)

Firefly's API requires the asset's hidden reconciliation account
(`<account name> reconciliation (<currency>)`) to already exist, but (as of 6.6.6):

- the API refuses to create accounts of type `reconciliation`,
- the API cannot auto-resolve the account during transaction creation
  (`Internal Firefly III Exception: Attempt to read property "type" on null`),
- and the UI's "Store reconciliation" with no transactions selected silently
  creates nothing.

Until a UI reconciliation with actual transactions has been performed once, create
the account directly in the database (adjust the asset account id — `10` here — and
currency code):

```sql
INSERT INTO accounts (created_at,updated_at,user_id,user_group_id,account_type_id,name)
  SELECT NOW(),NOW(),user_id,user_group_id,
         (SELECT id FROM account_types WHERE type='Reconciliation account'),
         CONCAT(name,' reconciliation (ILS)')
  FROM accounts WHERE id=10;
SET @rid=LAST_INSERT_ID();
INSERT INTO account_meta (account_id,name,data,created_at,updated_at)
  SELECT @rid,'currency_id',CONCAT('"',id,'"'),NOW(),NOW()
  FROM transaction_currencies WHERE code='ILS';
```

On Home Assistant this runs via the MariaDB add-on:
`docker exec addon_core_mariadb sh -c 'mariadb -u root -p"$(jq -r .mariadb_root_password /data/options.json)" firefly -e "<SQL>"'`

Verify with a 0.01 test transaction via the API (then delete it) — see the
`reconcileBalances()` transaction shape in `src/importer/index.js`.
