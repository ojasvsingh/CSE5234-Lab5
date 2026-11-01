# Run the local application with an RDS database

This route keeps the React website and both Node services on your computer, and puts the five database tables in Amazon RDS. It uses [infra/rds-local-access.yaml](../infra/rds-local-access.yaml). It does not require an EC2 server, a NAT gateway, or deployed Lambda functions.

The database has a public endpoint so your computer can connect. Its security group only allows port 3306 from the single public IPv4 address supplied as `ClientCidr`, and MySQL requires TLS. If your network or VPN changes your public IP, update that parameter before reconnecting. Never replace it with an unrestricted address range.

**Group deployment:** on November 1, 2026, stack `adventure-beyond-lab8-rds` completed successfully in the `school` account, region `us-east-1`. Its database `adventure-beyond-lab8` runs MySQL 8.4.11 on `db.t4g.micro`. Both desktop and phone checkouts saved orders to it. See [the verification record](LAB8-VERIFICATION.md#live-rds-verification). Check the current AWS status before a later demonstration; this record is a dated verification, not a live availability guarantee.

## Before creating resources

Use the AWS account selected for the course. For the `school` profile:

```sh
aws sso login --profile school
aws sts get-caller-identity --profile school --region us-east-1
```

Check the account before deploying. This setup creates a billable RDS instance, storage, a public IPv4 address, and an RDS-managed administrator secret in Secrets Manager. Free credits are account-specific and are not assumed.

For `us-east-1`, the November 1, 2026 list-price estimate for a `db.t4g.micro`, 20 GiB of gp3 storage, one public IPv4, and one secret is about **$18 for 30 days of continuous use**, before taxes, credits, extra backup storage, data transfer, or CPU surplus charges. This includes $0.016/hour for the instance, $0.115/GiB-month for gp3, $0.005/hour for public IPv4, and $0.40/month for the secret. Short demonstrations use a fraction of that time. Stopping RDS leaves storage, public IPv4, and secret charges, and AWS automatically restarts it after seven days.

## Create the database

In the CloudFormation console for the selected account and region, create a stack from `infra/rds-local-access.yaml`. Use a descriptive name such as `adventure-beyond-lab8-rds`. Supply:

| Parameter | Value |
| --- | --- |
| `VpcId` | A VPC with DNS support and DNS hostnames enabled |
| `SubnetIds` | Two public subnets in different Availability Zones with an internet gateway route |
| `ClientCidr` | Your current public IPv4 address followed by `/32` |
| `DatabaseName` | `adventure_beyond` |
| `DatabaseIdentifier` | `adventure-beyond-lab8` |
| `EngineVersion` | An available MySQL 8.4 version in the selected region |
| `InstanceClass` | `db.t4g.micro`, or `db.t3.micro` if required by the course account |

Review the resources, then create the stack. Wait for successful completion and database status `available`. Record its endpoint, security group, and administrator-secret ARN. These outputs are identifiers, not the administrator password.

## Initialize and connect

With dependencies installed and the stack complete, run:

```sh
npm run rds:setup
npm run dev:rds
```

The setup command reads the stack outputs and administrator secret using AWS CLI. It creates the five tables, inserts missing products, and creates `adventure_app`, which can read items and insert order records. It saves only this restricted user's connection in **`.env.rds`**, a Git-ignored file readable/writable by its owner. The administrator password stays in memory. Running setup again preserves products, orders, and the existing application password.

The defaults are profile `school`, region `us-east-1`, and stack `adventure-beyond-lab8-rds`. To select a different deployment, set `RDS_AWS_PROFILE`, `RDS_AWS_REGION`, and `RDS_STACK` for these commands. They do not create AWS resources. An existing `.env.rds` for a different database is rejected rather than overwritten.

Stop any existing `npm run dev` process before `npm run dev:rds`, because both use ports 5173, 3001, and 3002. Open `http://127.0.0.1:5173`. Database credentials must never have the `VITE_` prefix. Keep `.env.rds` private; teammates need an authorized database user and their own network access.

| Task | Command |
| --- | --- |
| Initialize the RDS database and local app connection | `npm run rds:setup` |
| Website and services connected to RDS | `npm run dev:rds` |
| Read products and saved order totals from RDS | `npm run rds:inspect` |
| Run the manual SQL example on RDS, then roll it back | `npm run rds:manual` |
| Return to the local Docker database | Stop the app, then `npm run db:up` and `npm run dev` |

The two inspection commands retrieve the administrator secret temporarily, so they require an active AWS login. The normal application uses `.env.rds` and does not need AWS CLI credentials. The local Docker `.env` and its existing data are unchanged.

If setup says `EXISTING_RDS_CONFIG_MISMATCH`, check the selected stack and saved connection before changing either. If the app user already exists in RDS but `.env.rds` has been lost, reset that user's password through an authorized administrator connection and save the matching connection privately; setup deliberately does not silently rotate another user's password.

## Verify and finish

1. Fetch inventory and confirm the response comes from RDS.
2. Submit a demo order from the browser.
3. Query the order and related tables through the administrator connection; match its confirmation and total.
4. Run `database/003-manual-check.sql` in one MySQL session.
5. Save screenshots showing the browser result and RDS/query evidence, without passwords or real personal data.

When the course demonstration is complete, delete the intended CloudFormation stack if the group no longer needs it. The template preserves a final snapshot; review and remove unneeded snapshots separately to end their storage charges. Do not delete unrelated resources in the account.

To temporarily stop this lab's database from the AWS console, select `adventure-beyond-lab8` in **RDS → Databases → Actions → Stop temporarily**. It will automatically restart after seven days, and storage, public IPv4, and secret charges remain. Start it again and wait for `available` before demonstrating the application.

For a private RDS database and AWS-hosted microservices instead, use [AWS.md](AWS.md).

## Official references

- [Public and private RDS access](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-public-private.html)
- [RDS for MySQL pricing](https://aws.amazon.com/rds/mysql/pricing/)
- [Public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)
- [Stopping RDS temporarily and remaining charges](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html)
