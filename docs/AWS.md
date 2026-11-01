# Optional AWS deployment for Labs 7–8

**These files are prepared for deployment; they do not prove that anything has been deployed.** Local development and tests create no AWS resources. Lab 8 explicitly asks for an RDS database, so actual RDS setup and verification remain necessary for that part of the assignment.

There are two templates:

- [infra/rds.yaml](../infra/rds.yaml): a private RDS MySQL instance, database subnet/parameter groups, two security groups in an **existing VPC**, and an RDS-managed administrator secret in Secrets Manager.
- [template.yaml](../template.yaml): two Node.js Lambda functions, two API Gateway REST APIs, execution roles, and `dev` stages. The functions connect to the existing database.

RDS, storage/backups, Secrets Manager, API Gateway, Lambda, and any NAT gateway can incur charges. No free-tier eligibility is assumed. The templates do not create a VPC, NAT gateway, or administration machine.

## 1. Choose the account and network

Install the AWS CLI and SAM CLI using the official links below. Use the account approved for the course:

```sh
aws sts get-caller-identity --profile school
aws configure get region --profile school
```

Replace `school` with your actual profile. Renew its login if needed. Do not put AWS credentials into this repository.

You need an existing VPC with at least **two private subnets in different Availability Zones**. The RDS template keeps the database private. The Lambda subnets must have outbound internet access through an existing NAT route because the order Lambda calls the inventory's public API Gateway URL over HTTPS. Putting Lambda in a public subnet alone does not provide internet access.

Also identify an approved way to run database initialization **inside that VPC**, such as an existing administration machine accessed through Systems Manager. It needs the application security group and a route to RDS. A normal laptop cannot directly reach this private RDS endpoint. Do not make the database public simply to bypass this requirement.

## 2. Create the database when deployment is authorized

Validate the files without creating a stack:

```sh
sam validate --lint --template-file template.yaml --profile school
aws cloudformation validate-template --template-body file://infra/rds.yaml --profile school
```

The RDS template defaults to MySQL `8.4.7`. Before deployment, check which 8.4 minor versions and instance classes are available in the chosen region, and change `EngineVersion` if necessary:

```sh
aws rds describe-db-engine-versions --engine mysql --query 'DBEngineVersions[?starts_with(EngineVersion, `8.4.`)].EngineVersion' --profile school
```

In the CloudFormation console for that account and region, create a stack from `infra/rds.yaml`. A suggested name is `adventure-beyond-lab8-db`. Supply:

| Parameter | Value |
| --- | --- |
| `VpcId` | The approved VPC |
| `PrivateSubnetIds` | Two or more private subnets in different Availability Zones |
| `DatabaseName` | `adventure_beyond` |
| `MasterUsername` | `adventure_admin`, or an approved administrator name |
| `EngineVersion` | A supported MySQL 8.4 minor version in this region |

RDS generates the administrator password and manages it in Secrets Manager. The account needs permission for this integration. Do not share credentials in screenshots or commits. Review the resources before creation. The database uses a single `db.t4g.micro` instance, 20 GiB of encrypted gp3 storage, one day of automated backups, and TLS-only database connections.

After the stack reports success, record these outputs: `DatabaseHost`, `DatabaseName`, `ApplicationSecurityGroupId`, and `AdminSecretArn`. Retrieve the administrator credentials from that secret through the AWS console when initializing the database. Attach the application security group to the approved administration machine used for the next step. Its ingress rule allows database access only from members of that group, on port 3306.

## 3. Initialize and create an application user

On the approved machine inside the VPC, clone the repo, run `npm ci`, and create an untracked `.env` with the administrator connection:

```dotenv
DB_HOST=YOUR_RDS_ENDPOINT
DB_PORT=3306
DB_NAME=adventure_beyond
DB_USER=adventure_admin
DB_PASSWORD=YOUR_PRIVATE_ADMIN_PASSWORD
DB_SSL=rds
```

Use:

```sh
npm run db:init
npm run db:inspect
```

The same SQL files used locally now create the five RDS tables and seed the products. `DB_SSL=rds` uses the `aws-ssl-profiles` RDS CA bundle and verifies both the certificate and database hostname. For another MySQL server, `DB_SSL=true` supports an optional `DB_SSL_CA` file. Do not disable certificate verification.

Using an encrypted MySQL administration session, create a separate application user with a new password:

```sql
CREATE USER 'adventure_app'@'%' IDENTIFIED BY 'REPLACE_WITH_A_NEW_PRIVATE_PASSWORD';
GRANT SELECT ON adventure_beyond.ITEM TO 'adventure_app'@'%';
GRANT INSERT ON adventure_beyond.CUSTOMER_ORDER TO 'adventure_app'@'%';
GRANT INSERT ON adventure_beyond.CUSTOMER_ORDER_LINE_ITEM TO 'adventure_app'@'%';
GRANT INSERT ON adventure_beyond.PAYMENT_INFO TO 'adventure_app'@'%';
GRANT INSERT ON adventure_beyond.SHIPPING_INFO TO 'adventure_app'@'%';
```

The application only needs item reads and order inserts. Keep the administrator connection for schema changes and inspection. Do not run `db:init` or `db:inspect` with the restricted application user. Replace the backend's `DB_USER`/`DB_PASSWORD` with the application credentials for normal operation.

## 4. Deploy the microservices, if required

RDS data integration can be tested by running the existing Node services on the approved VPC machine. If also deploying the Lab 7 Lambda/API Gateway tier, use the root SAM template.

From the project root:

```sh
sam build --use-container
sam deploy --guided --profile school
```

Docker must be running for the container build. The template uses Node.js 22. With Node.js 22 installed locally, native `sam build` is also available. The backend has its own `services/package.json` and lockfile so SAM includes the MySQL driver.

Use `adventure-beyond-lab8-api` as a new stack name, or deliberately update the group's existing API stack. Supply the database host/name, application username/password, application security group ID, and private subnet IDs. Use the **same VPC** as RDS and the subnets with NAT egress. Allow the Lambda execution roles to be created. Their VPC policy permits network interface management.

Do **not** save secret parameter values to `samconfig.toml` or a shared command history. Answer no when asked to save guided deployment arguments containing a password. The repo ignores SAM config files as an additional guard. Lambda receives the password as an encrypted-at-rest environment variable; change that parameter and redeploy if the application password is rotated.

Review the change set before applying it. The APIs are unauthenticated classroom endpoints. The template configures CORS on success/error responses; it does not enable request-body tracing.

The outputs are `InventoryApiUrl` and `OrderApiUrl`. Put them in the frontend's untracked `.env.local`:

```dotenv
VITE_INVENTORY_API_URL=https://YOUR_INVENTORY_API.execute-api.YOUR_REGION.amazonaws.com/dev
VITE_ORDER_API_URL=https://YOUR_ORDER_API.execute-api.YOUR_REGION.amazonaws.com/dev
```

Include `/dev` but no endpoint path. Restart `npm run dev:frontend`. For static hosting, set these values before `npm run build`, and configure the host to serve `index.html` for client-side routes. Database credentials must never use the `VITE_` prefix.

## 5. Verify RDS integration

1. List inventory, look up an ID, and search by name using the calls in [API.md](API.md).
2. Edit a product in RDS and confirm that the next API call and browser refresh show the change. Restore the sample data afterward.
3. Submit [examples/order.json](../examples/order.json). Expect `201`, `orderId`, `status: "New"`, and a confirmation number.
4. From the administration connection, query all four order-related tables and compare the saved ID, quantities, and total with the API response.
5. Request more than the current stock. Expect `409` and no new order rows.
6. Run `database/003-manual-check.sql` in one MySQL session to demonstrate the requested manual inserts.
7. Capture the RDS instance status, table/query results, and browser confirmation without exposing passwords or real customer information.

Template validation checks syntax and resource properties. Only these live checks establish that RDS, networking, permissions, and APIs work together in the actual account.

## 6. Cleanup after the course demo

Delete only the lab stacks you actually created. Remove the API stack before the RDS stack so Lambda can release its VPC network interfaces. The RDS template uses `DeletionPolicy: Snapshot` and `UpdateReplacePolicy: Snapshot`: deletion or replacement preserves a database snapshot that may continue to incur storage charges. Inspect retained snapshots and delete them only when the group's data is no longer needed.

The templates do not own any existing VPC, NAT gateway, or administration machine. Their resources and costs must be reviewed separately. Deleting a CloudFormation stack does not prove the account has no remaining charges.

## Official references

- [MySQL versions supported by RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Concepts.VersionMgmt.html)
- [RDS DBInstance CloudFormation properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbinstance.html)
- [Lambda VPC internet access](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)
- [Using Lambda with RDS](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)
- [Install AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [mysql2 connections and TLS](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-pool)
