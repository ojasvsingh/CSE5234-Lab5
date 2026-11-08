# Lab 9 verification — November 8, 2026

**Status: local and live AWS integration verified on November 8, 2026.** The AWS check ran at 06:56–06:57 UTC using the `school` account (`358148451783`), region `us-east-1`. The existing RDS instance was started for the demonstration; payment/shipping and the event route were deployed as stack `adventure-beyond-lab9`.

The local demonstration uses four Node services, two background workers, and MySQL 8.4 with three databases. Event delivery is simulated locally. It is not evidence of AWS EventBridge/SNS routing.

The separate AWS demonstration below uses the local website/inventory/order/publisher, the existing RDS instance with three independently credentialed databases, and real AWS payment/shipping Lambdas, EventBridge, and SNS.

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
| `npm run lab9:capture:aws` | Two browser orders saved through the real AWS payment and shipping path; repeat delivery kept one shipment per order |
| `npm run lab9:audit:aws` | Live routing, SNS/Lambda permissions, invocation logs, empty failure queue, DB isolation, stock rejection, and old orders verified |

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

## Live AWS evidence

Both stacks reported `CREATE_COMPLETE`: `adventure-beyond-lab9` and its private build-artifact stack `adventure-beyond-lab9-artifacts`. The original `adventure-beyond-lab8-rds` stack and its data were retained.

| Browser | RDS order | Total | Event request ID | Packets / weights |
| --- | --- | --- | --- | --- |
| Desktop | `AB-00000004` | $207.00 | `c465ce8d-cd1f-42da-9978-47a6557e1527` | 2 / `[2, 1]` lb |
| Mobile | `AB-00000005` | $207.00 | `8f0e74d4-c162-46b7-9e71-a1b9c5865431` | 2 / `[2, 1]` lb |

Local and RDS databases generate their own IDs, so matching order numbers across the two demonstrations do not mean they share a record. The payment tokens and event IDs in their JSON evidence distinguish them.

The cloud verification established:

- Payment Lambda processed both payments; each order saved only its returned token.
- EventBridge's enabled rule matched `adventure-beyond.orders` / `ShipmentRequested` / schema version 1 and targeted the SNS topic.
- The confirmed SNS subscription targeted shipping Lambda, with a topic-restricted invocation permission.
- CloudWatch reported 2 payment and 4 shipping invocations during browser capture. Each shipping event was sent twice; each request still had exactly one shipment row.
- The shipping HTTP API returned the same token for a previously delivered shipment request.
- All outbox messages were published, and visible/in-flight/delayed failure-queue counts were zero.
- Payment/shipping users could not read each other's or the store's tables; the store user could not read either partner database.
- A stock-shortage request returned 409 without adding a payment, order, or outbox row.
- The original 2 Lab 8 orders retained their status, line counts, and totals; the 2 legacy masked-payment rows were preserved.

Evidence files:

- [Cloud routing and invocation verification image](screenshots/lab9-aws/cloud-verification.png)
- [Sanitized AWS configuration, logs, and checks](screenshots/lab9-aws/cloud-verification.json)
- [RDS order/payment/shipment verification image](screenshots/lab9-aws/database-verification.png)
- [RDS order evidence JSON](screenshots/lab9-aws/evidence.json)
- [Desktop review](screenshots/lab9-aws/desktop-review.png) / [confirmation](screenshots/lab9-aws/desktop-confirmation.png)
- [Mobile review](screenshots/lab9-aws/mobile-review.png) / [confirmation](screenshots/lab9-aws/mobile-confirmation.png)

The configuration/database verification images are generated from actual AWS CLI responses and SQL results. They are not screenshots of the AWS Console. Browser screenshots were captured while the app used the deployed AWS services.

## After the demonstration

The cloud-connected app and publisher were stopped after all messages were delivered. RDS shutdown was requested to avoid leaving the instance running between demos. The partner functions, APIs, EventBridge/SNS configuration, build bucket, and saved data remain for the next demonstration.

Check the current RDS status before starting `dev:aws` again; if stopped, renew school login and start the existing instance. Follow [LAB9.md](LAB9.md) for restart and cleanup. The ordinary local app does not require RDS.
