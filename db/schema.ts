import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';

/** Co-op is a separate durable save namespace. Solo browser saves are never migrated. */
export const coopRooms=sqliteTable('axiom_coop_rooms',{
  id:text('id').primaryKey(),
  ownerId:text('owner_id').notNull(),
  inviteCode:text('invite_code').notNull(),
  revision:integer('revision').notNull(),
  updatedAt:integer('updated_at').notNull(),
  body:text('body').notNull(),
},table=>[
  uniqueIndex('axiom_coop_invite_unique').on(table.inviteCode),
  index('axiom_coop_owner_updated').on(table.ownerId,table.updatedAt),
]);
export const coopRate=sqliteTable('axiom_coop_rate',{
  userId:text('user_id').primaryKey(),
  window:integer('window').notNull(),
  requests:integer('requests').notNull(),
});
