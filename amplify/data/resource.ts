import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Person: a
    .model({
      name: a.string().required(),
      relationshipCategory: a.enum(['FAMILY', 'FRIEND', 'COWORKER', 'ACQUAINTANCE', 'OTHER']),
      context: a.string(),
      phone: a.string(),
      email: a.string(),
      address: a.string(),
      birthday: a.date(),
      photoKey: a.string(),
      notes: a.string(),
      lastContactedDate: a.date(),
      connectionsAsA: a.hasMany('Connection', 'personAId'),
      connectionsAsB: a.hasMany('Connection', 'personBId'),
    })
    .authorization((allow) => [allow.owner()]),

  Connection: a
    .model({
      personAId: a.id().required(),
      personBId: a.id().required(),
      // Directional types (PARENT, MANAGER) are stored from A -> B's perspective;
      // the inverse label (Child, Report) is derived client-side, see src/lib/relationshipTypes.ts
      relationshipType: a.enum([
        'SPOUSE',
        'SIBLING',
        'FRIEND',
        'COWORKER',
        'ACQUAINTANCE',
        'PARENT',
        'MANAGER',
      ]),
      personA: a.belongsTo('Person', 'personAId'),
      personB: a.belongsTo('Person', 'personBId'),
    })
    .secondaryIndexes((index) => [index('personAId'), index('personBId')])
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
