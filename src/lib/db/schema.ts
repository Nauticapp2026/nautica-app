import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Roles de plataforma. Debe coincidir con src/config/roles.ts
 * y con el enum creado en la migración SQL de Supabase.
 */
export const roleEnum = pgEnum('app_role', [
  'super_admin',
  'marina_admin',
  'operator',
  'member',
  'provider',
  'guest',
]);

export const membershipStatusEnum = pgEnum('membership_status', ['active', 'suspended', 'removed']);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

/**
 * Guarderías (tenants).
 */
export const marinas = pgTable(
  'marinas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    taxId: text('tax_id'), // CUIT
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    logoUrl: text('logo_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('marinas_slug_idx').on(t.slug)],
);

/**
 * Perfil de usuario. Refleja auth.users (1:1) pero con data de negocio.
 * El id es el mismo UUID de auth.users.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // FK a auth.users.id (definida en SQL)
  email: text('email').notNull(),
  fullName: text('full_name'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Relación usuario ↔ guardería ↔ rol.
 * Un usuario puede pertenecer a varias guarderías, con distinto rol en cada una.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    marinaId: uuid('marina_id')
      .notNull()
      .references(() => marinas.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    status: membershipStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('memberships_user_marina_idx').on(t.userId, t.marinaId),
    index('memberships_marina_idx').on(t.marinaId),
    index('memberships_user_idx').on(t.userId),
  ],
);

/**
 * Invitaciones pendientes de aceptar.
 * Token único que se envía por email. Expira a los 7 días.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marinaId: uuid('marina_id')
      .notNull()
      .references(() => marinas.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: roleEnum('role').notNull(),
    token: text('token').notNull(),
    invitedBy: uuid('invited_by').references(() => profiles.id, { onDelete: 'set null' }),
    status: invitationStatusEnum('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('invitations_token_idx').on(t.token),
    index('invitations_marina_email_idx').on(t.marinaId, t.email),
  ],
);

// Relaciones
export const marinasRelations = relations(marinas, ({ many }) => ({
  memberships: many(memberships),
  invitations: many(invitations),
}));

export const profilesRelations = relations(profiles, ({ many }) => ({
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(profiles, { fields: [memberships.userId], references: [profiles.id] }),
  marina: one(marinas, { fields: [memberships.marinaId], references: [marinas.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  marina: one(marinas, { fields: [invitations.marinaId], references: [marinas.id] }),
  invitedByUser: one(profiles, { fields: [invitations.invitedBy], references: [profiles.id] }),
}));

// Tipos inferidos para uso en la app
export type Marina = typeof marinas.$inferSelect;
export type NewMarina = typeof marinas.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
