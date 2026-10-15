import { defineAuth } from '@aws-amplify/backend';

/**
 * Single-user app: self sign-up is disabled. The one account is created
 * manually post-deploy (Cognito console or `aws cognito-idp admin-create-user`).
 * @see https://docs.amplify.aws/react/build-a-backend/auth/
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
