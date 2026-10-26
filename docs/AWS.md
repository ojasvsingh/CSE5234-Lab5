# Deploy Lab 7 to AWS

The project includes [template.yaml](../template.yaml), an AWS SAM template for the Lambda and API Gateway approach described in the lab. Local and Lambda requests use the same business handlers. Node.js is the alternative technology stack used by this project.

The template creates two Lambda functions, two API Gateway REST APIs, their Lambda execution roles and invocation permissions, and `dev` stages. The order Lambda receives the inventory API's base URL through `INVENTORY_SERVICE_URL` and calls it over HTTP. No database or real payment service is created.

## 1. Choose the course AWS account

Install the AWS CLI and AWS SAM CLI using the official instructions linked below. Sign into the account you intend to use for the course. Keep credentials in your AWS profile, never in the repository or frontend `.env` file.

Before deploying, verify the account and region:

```sh
aws sts get-caller-identity --profile school
aws configure get region --profile school
```

`school` is an example profile name. Replace it with your intended profile. If it uses SSO and the session has expired, run `aws sso login --profile school` first. Course accounts may restrict IAM role creation; this template requires permission to create Lambda roles and API Gateway resources. If your course requires an existing execution role, set `Role` on both functions to that approved role ARN before deployment.

## 2. Build and deploy

From the project root, after running the local tests:

The template uses `nodejs22.x`. For a native `sam build`, use Node.js 22 locally. If your local Node major version differs, use `sam build --use-container` with Docker running, or switch to Node.js 22 for the build.

```sh
sam validate --lint --profile school
sam build
sam deploy --guided --profile school
```

Use `adventure-beyond-lab7` as the stack name, choose your intended region, and allow the template to create its Lambda execution roles. The APIs deliberately allow unauthenticated requests for the classroom storefront. Review the resources shown by SAM before confirming deployment. API requests and Lambda execution can incur AWS usage charges.

After deployment succeeds, SAM prints these outputs:

- **InventoryApiUrl**: the inventory base URL, including `/dev`.
- **OrderApiUrl**: the order base URL, including `/dev`.

Deployment status is established by the actual CloudFormation result, not just template validation. `aws cloudformation validate-template --template-body file://template.yaml` can perform a basic template check with the AWS CLI, but does not deploy the services or validate their runtime behavior.

## 3. Point the frontend at the deployed APIs

Copy [.env.example](../.env.example) to `.env.local` in the project root and paste the two outputs:

```dotenv
VITE_INVENTORY_API_URL=https://YOUR_INVENTORY_API.execute-api.YOUR_REGION.amazonaws.com/dev
VITE_ORDER_API_URL=https://YOUR_ORDER_API.execute-api.YOUR_REGION.amazonaws.com/dev
```

Do not append `/inventory-management/inventory` or `/order-processing/order`: the frontend adds those paths. These variables contain public endpoint addresses, not credentials.

Stop and restart the frontend:

```sh
npm run dev:frontend
```

Open the local website. It now talks directly to the AWS APIs. The browser's Network panel should show inventory GET requests and an order POST to the invoke URLs. You do not need the local backend processes in this mode. If deploying the frontend to a static host, set these variables **before** `npm run build`, because Vite includes their values in the build.

To switch back to local services, remove/comment the two values in `.env.local`, restart, and run `npm run dev`.

## 4. Verify the deployed behavior

Use the examples in [API.md](API.md), replacing each local base URL with the corresponding AWS output. Verify:

1. List all inventory items.
2. Look up `ridge-daypack` by ID.
3. Search names with `?name=Insulated%20Bottle`.
4. POST [examples/order.json](../examples/order.json): expect `201` and a confirmation.
5. Request 13 daypacks: expect `409` and available quantity 12.
6. Complete an order from the browser and confirm that its displayed number matches the POST response.

API Gateway passes name filters in `event.queryStringParameters`; item IDs are also available in `event.pathParameters`. The adapter reads the actual request path for ID routing and `queryStringParameters` for filters. The lab walkthrough's reference to `pathParameters` for query strings should not be copied literally.

CORS is configured on both APIs and on Lambda success/error responses. If the browser reports a CORS problem, check the invoke URL, stage, request method, and Lambda logs. Do not enable request-body/data tracing for sample payment payloads.

## 5. Cleanup

When the group no longer needs this deployed stack:

```sh
sam delete --stack-name adventure-beyond-lab7 --profile school
```

Review the stack name, account, region, and deletion prompt before continuing. Delete only this lab's stack. SAM may also prompt about packaged artifacts. Lambda-created CloudWatch log groups can remain after stack deletion and can be removed separately when no longer needed.

## Official references

- [Install AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [SAM API resource and supported properties](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-api.html)
- [API Gateway Lambda proxy request and response formats](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html)
- [SAM CORS configuration](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-api-corsconfiguration.html)
