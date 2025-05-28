import { protectedProcedure, router } from '../../trpc';
import { createDriver } from '../../../lib/driver';
import { imapConnection } from '@zero/db/schema';
import { createId } from '@paralleldrive/cuid2';
import { TRPCError } from '@trpc/server';
import { db } from '@zero/db';
import ImapClient from 'imap';
import { z } from 'zod';

export const imapLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  imapServer: z.string().optional(),
  smtpServer: z.string().optional(),
  imapPort: z.number().optional(),
  smtpPort: z.number().optional(),
});

export const imapRouter = router({
  connect: protectedProcedure.input(imapLoginSchema).mutation(async ({ ctx, input }) => {
    // First, validate the IMAP credentials by attempting to connect
    let imap: ImapClient;

    try {
      // Create a new IMAP client with the provided credentials
      imap = new ImapClient({
        user: input.email,
        password: input.password,
        host: input.imapServer || `imap.${input.email.split('@')[1]}`,
        port: input.imapPort || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
      });

      // Test the connection
      await new Promise<void>((resolve, reject) => {
        imap.once('ready', () => {
          resolve();
        });

        imap.once('error', (error) => {
          reject(error);
        });

        imap.connect();
      });

      // Close the connection after successful test
      imap.end();
    } catch (error) {
      console.error('IMAP connection test failed:', error);
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'IMAP authentication failed. Please check your credentials and server settings.',
      });
    }

    // Generate a unique ID for the connection
    const connectionId = createId();

    // Create the connection record in the database
    await db.insert(imapConnection).values({
      id: connectionId,
      userId: ctx.user.id,
      email: input.email,
      // Use the password as the "access token" for IMAP
      accessToken: input.password,
      // No refresh token for IMAP
      refreshToken: null,
      // Set an arbitrary expiry date far in the future
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      imapServer: input.imapServer || `imap.${input.email.split('@')[1]}`,
      smtpServer: input.smtpServer || `smtp.${input.email.split('@')[1]}`,
      imapPort: input.imapPort || 993,
      smtpPort: input.smtpPort || 465,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Test the driver integration
    try {
      const driver = createDriver('imap', {
        auth: {
          userId: ctx.user.id,
          accessToken: input.password,
          refreshToken: '',
          email: input.email,
        },
      });

      // Try to list INBOX to verify connectivity
      await driver.list({
        folder: 'INBOX',
        maxResults: 1,
      });
    } catch (error) {
      console.error('Driver test failed after connection creation:', error);

      // Delete the connection record if driver test fails
      await db.delete(imapConnection).where({
        id: connectionId,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to setup IMAP connection through the mail driver.',
      });
    }

    return {
      success: true,
      connection: {
        id: connectionId,
        email: input.email,
      },
    };
  }),
});
