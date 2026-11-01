# Lab 8 local verification

Verified on **November 1, 2026**, using the local MySQL 8.4 Docker database. **No AWS resources were created or deployed.** The RDS portion of the assignment still requires a live cloud demonstration.

| Check | Result |
| --- | --- |
| `npm ci` | Website and service dependencies installed from lockfiles |
| `npm test` | 27 passed: 12 unit tests and 15 API/database tests |
| `npm run test:e2e` | 40 passed across desktop and phone layouts; production build passed |
| `npm run db:init` twice | Five seeded products; existing edits and orders preserved |
| `database/003-manual-check.sql` | Related records inserted, status defaulted to New, then rolled back |
| `npm run db:inspect` before/after database restart | Both screenshot orders remained, with matching totals |
| Documented restricted application database grants | Inventory read and complete order insert succeeded |
| TLS with an untrusted local certificate | Connection rejected |
| `cfn-lint template.yaml infra/rds.yaml` | Passed without warnings or errors; no deployment performed |

The API tests use a real, separate MySQL database. They verify live SQL changes, exact saved prices, foreign-key relationships, quantity validation, missing stock, database failures, and complete rollback after a simulated failure on the second line insert. Browser tests query their newly saved order in SQL and match its displayed confirmation and total.

## Screenshot orders

Both orders contain two daypacks and one bottle. These are demonstration records in the development database, separate from automated test orders. Their related shipping and payment records were queried directly, and the same order records were present after restarting MySQL.

| Screenshot | Saved order ID | Confirmation | Status | Item lines | Total |
| --- | --- | --- | --- | --- | --- |
| Desktop | 1 | AB-00000001 | New | 2 | $207.00 |
| Phone | 2 | AB-00000002 | New | 2 | $207.00 |

Full screenshots:

- [Desktop shipping form with email](screenshots/lab8/desktop-shipping.png)
- [Desktop confirmation](screenshots/lab8/desktop-confirmation.png)
- [Phone shipping form with email](screenshots/lab8/mobile-shipping.png)
- [Phone confirmation](screenshots/lab8/mobile-confirmation.png)

![Desktop confirmation for saved order AB-00000001](screenshots/lab8/desktop-confirmation.png)

## Limits

Stock is checked without being decremented. Payment is a demo: the database stores a masked number and no CVV. There is no durable idempotency key, so retrying after a lost success response may create another order. The AWS templates and networking instructions have not been exercised in a cloud account.
