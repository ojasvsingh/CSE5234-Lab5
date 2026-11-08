# Lab 9 verification — November 8, 2026

**Status: local implementation verified; live AWS Lab 9 verification pending.** School SSO was expired. No Lab 9 cloud resources were created in this run. The existing Lab 8 RDS instance's current status could not be verified without renewed login.

The local demonstration uses four Node services, two background workers, and MySQL 8.4 with three databases. Event delivery is simulated locally. It is not evidence of AWS EventBridge/SNS routing.

## Checks completed

| Check | Result |
| --- | --- |
| `npm run db:init` | Migrated existing local data and created independent partner accounts |
| `npm test` | 36 tests passed |
| `npm run test:e2e` | 40 tests passed, desktop and mobile |
| Production build | Passed as part of browser-test startup |
| CloudFormation/SAM static validation | `infra/lab9.yaml`, `infra/lab9-artifacts.yaml`, and root `template.yaml` passed `cfn-lint` |
| Browser + saved database records | Two $207 orders matched to their payment tokens, published events, and shipments |
| Shipping replay | Matching shipment row count stayed at 1; API tests also verified duplicate delivery and conflicting payload rejection |

The tests cover per-item inventory calls, no payment on invalid stock, payment outages, SQL rollback, authoritative totals, independent database permissions, publishing failures and retries, malformed SNS events, and consumer failures that request redelivery. They run on port 33307 in disposable databases, separately from development and RDS.

## Local evidence

Captured at **2026-11-08 05:39 UTC** using fictional customer details:

| Browser | Order | Total | Packets | Weights |
| --- | --- | --- | --- | --- |
| Desktop | `AB-00000004` | $207.00 | 2 | `[2, 1]` lb |
| Mobile | `AB-00000005` | $207.00 | 2 | `[2, 1]` lb |

Both have status `New`, a `PAY-` token, a committed and published outbox event, and a matching `SHP-` token in the shipping database. The new store payment foreign key is `NULL`. The payment database stores a masked number and a `NULL` CVV.

- [Sanitized machine-readable evidence](screenshots/lab9/evidence.json)
- [Database verification](screenshots/lab9/database-verification.png)
- [Desktop review](screenshots/lab9/desktop-review.png)
- [Desktop confirmation](screenshots/lab9/desktop-confirmation.png)
- [Mobile review](screenshots/lab9/mobile-review.png)
- [Mobile confirmation](screenshots/lab9/mobile-confirmation.png)

The database screenshot is a readable presentation generated from actual SQL query results. It is not an AWS-console screenshot. The JSON records the source commit and that implementation edits were still uncommitted during capture.

## Remaining AWS acceptance checks

After school login is renewed, follow [LAB9.md](LAB9.md):

1. Check/start the existing RDS instance and verify the laptop's `/32` access.
2. Run `lab9:setup`, then `lab9:deploy`.
3. Start `dev:aws` and run `lab9:capture:aws`.
4. Verify EventBridge rule/target, SNS subscription, shipping Lambda invocation, saved shipment, and empty failure queue.
5. Add the actual AWS screenshots/results here. Do not rename local evidence as cloud evidence.
6. After pending messages are delivered, pause RDS if the group no longer needs it running.
