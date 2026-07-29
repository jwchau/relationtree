import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
});

// Single-user app: block public self sign-up. The one account is created
// manually post-deploy (Cognito console or `aws cognito-idp admin-create-user`).
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};

// Personal, hard-to-recreate data — enable Point-in-Time Recovery on every
// model's underlying DynamoDB table so it's restorable for 35 days.
//
// Amplify Gen 2 provisions model tables as `Custom::AmplifyDynamoDBTable`
// resources (not a plain CDK `CfnTable`), so they show up under
// `cfnResources.amplifyDynamoDbTables` (AmplifyDynamoDbTableWrapper), not
// `cfnResources.cfnTables` — that bucket is only populated for tables that
// are literally `aws_dynamodb.CfnTable` instances, which ours never are.
const amplifyDynamoDbTables = backend.data.resources.cfnResources.amplifyDynamoDbTables;
for (const modelName of Object.keys(amplifyDynamoDbTables)) {
  amplifyDynamoDbTables[modelName].pointInTimeRecoveryEnabled = true;
}
