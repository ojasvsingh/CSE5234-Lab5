# Optional AWS-hosted storefront for Lab 9

For the normal Lab 9 deployment—local storefront and publisher, with payment/shipping in AWS—follow [LAB9.md](LAB9.md). This page describes the additional option of hosting inventory/order and the publisher in AWS too. **These templates are deployment options, not evidence that those resources are running.**

## Templates and order of deployment

1. **Existing MySQL database.** Reuse the group's RDS instance where possible. `infra/rds.yaml` is an optional private RDS template for a different environment; do not deploy it merely to add Lab 9 to the existing setup.
2. **Partner services.** `infra/lab9.yaml` creates payment/shipping functions and APIs, EventBridge/SNS routing, and delivery permissions. Initialize the independent partner databases/users first, as described in [LAB9.md](LAB9.md).
3. **Storefront services.** Root `template.yaml` creates inventory/order Lambda functions, two REST APIs, and an outbox publisher scheduled once per minute. It uses the existing store database and partner stack's payment API/event bus.

The templates do not create a VPC or NAT gateway. AWS resources, retained storage, logs, and network egress may incur charges.

## Network requirements

Use the course-approved account/profile and `us-east-1`. The database and application security group must be in the same VPC as the functions. Supply at least two suitable subnets.

The **storefront functions** need outbound HTTPS access to inventory/payment APIs and EventBridge, for example through an existing NAT route in private subnets. Putting Lambda in a public subnet alone does not give it internet access. This extra egress is unnecessary for the partner-only deployment in [LAB9.md](LAB9.md), because those functions only connect to MySQL inside the VPC.

For a private database, run initialization from an approved machine inside the VPC. It needs database access on port 3306 and TLS. A normal laptop cannot directly reach a private RDS endpoint.

## Database preparation

For the group's existing stack, use `npm run lab9:setup`. This migrates the store, creates the partner databases/users, and saves private configuration without printing credentials.

For a different private-database environment, prepare an untracked administrator `.env` on the approved VPC machine. Use `DB_HOST`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_SSL=rds`. Initialize the store with:

```sh
node --env-file=.env --input-type=module -e 'import {createDatabasePool} from "./services/database/pool.js"; import {initializeDatabase} from "./scripts/database.mjs"; const pool=createDatabasePool(); try { await initializeDatabase(pool); } finally { await pool.end(); }'
```

The regular `db:init` command is restricted to local Docker setup. The migration preserves existing products and orders. Keep administrator credentials only for setup and inspection.

Create a restricted store user in an encrypted MySQL session:

```sql
CREATE USER 'adventure_app'@'%' IDENTIFIED BY 'REPLACE_WITH_A_NEW_PRIVATE_PASSWORD' REQUIRE SSL;
GRANT SELECT ON adventure_beyond.ITEM TO 'adventure_app'@'%';
GRANT INSERT ON adventure_beyond.CUSTOMER_ORDER TO 'adventure_app'@'%';
GRANT INSERT ON adventure_beyond.CUSTOMER_ORDER_LINE_ITEM TO 'adventure_app'@'%';
GRANT INSERT ON adventure_beyond.SHIPPING_INFO TO 'adventure_app'@'%';
GRANT SELECT, INSERT, UPDATE ON adventure_beyond.SHIPMENT_OUTBOX TO 'adventure_app'@'%';
```

Do not grant the storefront access to the partner databases. Provision those databases using their maintained schema files and separate users with `SELECT, INSERT` on their own table. Deploy the partner stack before the storefront stack.

`DB_SSL=rds` uses the RDS CA bundle and verifies the certificate and hostname. Do not disable certificate verification. Never prefix database credentials with `VITE_`.

## Deploy the storefront stack

Install AWS SAM CLI if using this optional workflow. From the repository root:

```sh
sam validate --lint --template-file template.yaml --profile school --region us-east-1
sam build --use-container
sam deploy --guided --profile school --region us-east-1
```

Use a separate stack name such as `adventure-beyond-lab9-store`. Supply:

| Parameter | Value |
| --- | --- |
| `DatabaseHost`, `DatabaseName` | Existing store database |
| `DatabaseUser`, `DatabasePassword` | Restricted store account |
| `ApplicationSecurityGroupId` | A group permitted to reach RDS on port 3306 |
| `PrivateSubnetIds` | VPC subnets with HTTPS egress |
| `PaymentServiceUrl` | `PaymentApiUrl` from the partner stack, including `/dev` |
| `EventBusName` | Event bus name from the partner stack |

The publisher's role can only describe and publish to the supplied event bus, in addition to basic Lambda/VPC permissions. Its database access uses the restricted store account. No partner credentials are supplied to the store functions.

Do not save secret parameter values to `samconfig.toml`, command history, or screenshots. Review the change set before applying it. The APIs are unauthenticated classroom endpoints; request-body tracing is not enabled.

Set the returned `InventoryApiUrl` and `OrderApiUrl` as public frontend build settings in an ignored `.env.local`:

```dotenv
VITE_INVENTORY_API_URL=https://YOUR_INVENTORY_API.execute-api.us-east-1.amazonaws.com/dev
VITE_ORDER_API_URL=https://YOUR_ORDER_API.execute-api.us-east-1.amazonaws.com/dev
```

Include `/dev` and omit the endpoint path. Restart `npm run dev:frontend`, or set these values before `npm run build`. Do not also start a local publisher for the cloud demonstration unless deliberately sharing the outbox.

## Verify and clean up

1. Read inventory by ID and name; confirm it reflects SQL changes.
2. Submit a demo order and match the receipt total and payment token to saved records.
3. Request excess stock; confirm no payment/order/outbox entry is added.
4. Allow up to one minute for the scheduled publisher. Match its event ID to the independent shipping row and verify packet weights.
5. Inspect the EventBridge rule/target, SNS subscription, shipping Lambda, and failure queue.
6. Capture actual AWS and database evidence without credentials or real customer data.

Disable the scheduled publisher before pausing its RDS database, after pending orders have been delivered. Delete only stacks the group no longer needs, removing the storefront and partner Lambda stacks before any RDS stack. The optional RDS template retains a snapshot on deletion; retained snapshots can continue to incur storage charges. Existing VPC/NAT resources are outside these templates and require separate review. See [LAB9.md](LAB9.md) for partner-stack cleanup.

## Official references

- [Lambda VPC internet access](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)
- [Using Lambda with RDS](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)
- [Install AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [EventBridge target permissions](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html)
