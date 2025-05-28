import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const imapConnection = pgTable(
  'mail0_imap_connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    email: text('email').notNull(),
    accessToken: text('access_token').notNull(), // Password for IMAP
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at').notNull(),
    imapServer: text('imap_server').notNull(),
    smtpServer: text('smtp_server').notNull(),
    imapPort: text('imap_port').notNull(),
    smtpPort: text('smtp_port').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => ({
    userIdIdx: index('mail0_imap_connection_user_id_idx').on(t.userId),
    emailIdx: index('mail0_imap_connection_email_idx').on(t.email),
  }),
);
