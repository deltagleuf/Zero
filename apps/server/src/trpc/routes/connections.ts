import { createRateLimiterMiddleware, privateProcedure, router } from '../trpc';
import { connection, imapConnection, user as user_ } from '@zero/db/schema';
import { imapRouter } from './connections/imap';
import { Ratelimit } from '@upstash/ratelimit';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

export const connectionsRouter = router({
  imap: imapRouter,
  list: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(60, '1m'),
        generatePrefix: ({ session }) => `ratelimit:get-connections-${session?.user.id}`,
      }),
    )
    .query(async ({ ctx }) => {
      const { db, session } = ctx;
      // Get standard connections
      const standardConnections = await db
        .select({
          id: connection.id,
          email: connection.email,
          name: connection.name,
          picture: connection.picture,
          createdAt: connection.createdAt,
          providerId: connection.providerId,
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
        })
        .from(connection)
        .where(eq(connection.userId, session.user.id));

      // Get IMAP connections
      const imapConnections = await db
        .select({
          id: imapConnection.id,
          email: imapConnection.email,
          createdAt: imapConnection.createdAt,
          accessToken: imapConnection.accessToken,
          refreshToken: imapConnection.refreshToken,
        })
        .from(imapConnection)
        .where(eq(imapConnection.userId, session.user.id));

      // Combine and format connections
      const connections = [
        ...standardConnections,
        ...imapConnections.map((conn) => ({
          ...conn,
          name: conn.email.split('@')[0], // Use local part of email as name
          picture: null, // No avatar for IMAP connections
          providerId: 'imap' as const,
        })),
      ];

      const disconnectedIds = connections
        .filter((c) => !c.accessToken || !c.refreshToken)
        .map((c) => c.id);

      return {
        connections: connections.map((connection) => {
          return {
            id: connection.id,
            email: connection.email,
            name: connection.name,
            picture: connection.picture,
            createdAt: connection.createdAt,
            providerId: connection.providerId,
          };
        }),
        disconnectedIds,
      };
    }),
  setDefault: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const { db } = ctx;
      const user = ctx.session.user;
      const foundConnection = await db.query.connection.findFirst({
        where: and(eq(connection.id, connectionId), eq(connection.userId, user.id)),
      });
      if (!foundConnection) throw new TRPCError({ code: 'NOT_FOUND' });
      await db
        .update(user_)
        .set({ defaultConnectionId: connectionId })
        .where(eq(user_.id, user.id));
    }),
  delete: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const { db } = ctx;
      const user = ctx.session.user;
      await db
        .delete(connection)
        .where(and(eq(connection.id, connectionId), eq(connection.userId, user.id)));

      if (connectionId === ctx.session.connectionId)
        await db.update(user_).set({ defaultConnectionId: null });
    }),
});
