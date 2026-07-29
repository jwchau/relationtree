# RelationTree

A personal relationship tracker: add people (family, friends, coworkers,
acquaintances), link them to each other with typed relationships, and browse
the resulting graph.

## Stack

- React + Vite + TypeScript, Tailwind CSS + shadcn/ui, React Flow (`@xyflow/react`)
- AWS Amplify Gen 2 (Cognito auth, AppSync/DynamoDB data, S3 storage, Hosting)
- Vitest for unit tests, oxlint for linting

## Local development

```bash
npm install
npm run sandbox   # deploys a personal Amplify backend sandbox and watches for changes
npm run dev       # in a second terminal, starts the Vite dev server
```

`npm run sandbox` writes `amplify_outputs.json` (gitignored) — the frontend won't
build without it.

## Single-user account

Self sign-up is disabled (`amplify/backend.ts` sets
`allowAdminCreateUserOnly: true` on the Cognito user pool). Create the one
account manually:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <user_pool_id from amplify_outputs.json> \
  --username <your-email> \
  --user-attributes Name=email,Value=<your-email> Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id <user_pool_id> \
  --username <your-email> \
  --password '<a-strong-temporary-password>'
```

The Authenticator will prompt for a permanent password change on first sign-in.

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

All four run in CI (`amplify.yml`, `preBuild` phase) and must pass before a deploy proceeds.

## Git workflow

- `dev` branch → dev Amplify environment (auto-deploys on push)
- `main` branch → prod Amplify environment
- Ship by opening a PR from `dev` → `main`

## Cost safety nets

- DynamoDB Point-in-Time Recovery is enabled in code (`amplify/backend.ts`) for both the `Person` and `Connection` tables.
- **AWS Budget alert (manual, one-time setup):** this isn't expressible through Amplify Gen 2's standard constructs without a raw CDK `aws-budgets` escape hatch, so set it up once by hand:
  1. AWS Console → **Billing and Cost Management** → **Budgets** → **Create budget**.
  2. Choose a **Cost budget**, monthly period, set a threshold around **$5–10**.
  3. Add an email alert (e.g., at 80% and 100% of the threshold) to the account owner's email.

See [MANUAL_TESTS.md](./MANUAL_TESTS.md) for the manual regression checklist to run before merging `dev` → `main`.
