import { defineBackend } from '@aws-amplify/backend';
import type { CfnTable } from 'aws-cdk-lib/aws-dynamodb';
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
const tables = backend.data.resources.tables;
for (const modelName of Object.keys(tables)) {
  const cfnTable = tables[modelName].node.defaultChild as CfnTable;
  cfnTable.pointInTimeRecoverySpecification = {
    pointInTimeRecoveryEnabled: true,
  };
}
