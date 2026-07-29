import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'relationtree-photos',
  access: (allow) => ({
    'photos/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],
  }),
});
