import { FatalErrors, deleteActiveConnection, sanitizeContext, StandardizedError } from './utils';
import type { MailManager, ManagerConfig, ParsedDraft, IGetThreadResponse } from './types';
import { parseFrom, parseAddressList, wasSentWithTLS } from '../email-utils';
import type { IOutgoingMessage, Label, ParsedMessage } from '../../types';
import * as SMTPConnection from 'nodemailer/lib/smtp-connection';
import { sanitizeTipTapHtml } from '../sanitize-tip-tap-html';
import { simpleParser, type AddressObject } from 'mailparser';
import { type CreateDraftData } from '../schemas';
import { setTimeout } from 'timers/promises';
import * as nodemailer from 'nodemailer';
import ImapClient from 'imap';
import * as he from 'he';

export class ImapMailManager implements MailManager {
  private imap: ImapClient;
  private smtp: nodemailer.Transporter;

  constructor(public config: ManagerConfig) {
    // Initialize IMAP client
    this.imap = new ImapClient({
      user: config.auth.email,
      password: config.auth.accessToken,
      host: this.getImapHost(config.auth.email),
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }, // Consider making this configurable for security
      authTimeout: 30000,
    });

    // Initialize SMTP client for sending emails
    this.smtp = nodemailer.createTransport({
      host: this.getSmtpHost(config.auth.email),
      port: 465,
      secure: true,
      auth: {
        user: config.auth.email,
        pass: config.auth.accessToken,
      },
    });
  }

  private getImapHost(email: string): string {
    // Determine IMAP host based on email domain
    const domain = email.split('@')[1].toLowerCase();

    // Common email providers
    switch (domain) {
      case 'gmail.com':
        return 'imap.gmail.com';
      case 'outlook.com':
      case 'hotmail.com':
      case 'live.com':
        return 'outlook.office365.com';
      case 'yahoo.com':
        return 'imap.mail.yahoo.com';
      case 'aol.com':
        return 'imap.aol.com';
      case 'icloud.com':
        return 'imap.mail.me.com';
      default:
        return `imap.${domain}`; // Default assumption - may need configuration
    }
  }

  private getSmtpHost(email: string): string {
    // Determine SMTP host based on email domain
    const domain = email.split('@')[1].toLowerCase();

    // Common email providers
    switch (domain) {
      case 'gmail.com':
        return 'smtp.gmail.com';
      case 'outlook.com':
      case 'hotmail.com':
      case 'live.com':
        return 'smtp.office365.com';
      case 'yahoo.com':
        return 'smtp.mail.yahoo.com';
      case 'aol.com':
        return 'smtp.aol.com';
      case 'icloud.com':
        return 'smtp.mail.me.com';
      default:
        return `smtp.${domain}`; // Default assumption - may need configuration
    }
  }

  public getScope(): string {
    return 'imap smtp'; // Not used for IMAP, but needed for interface
  }

  private async connectImap(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.once('ready', () => {
        resolve();
      });

      this.imap.once('error', (err) => {
        reject(err);
      });

      this.imap.connect();
    });
  }

  private async openMailbox(mailbox: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.openBox(mailbox, false, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async searchEmails(criteria: any[]): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.imap.search(criteria, (err, uids) => {
        if (err) {
          reject(err);
        } else {
          resolve(uids);
        }
      });
    });
  }

  private async fetchMessages(uids: number[], options: ImapClient.FetchOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      if (uids.length === 0) {
        resolve([]);
        return;
      }

      const fetch = this.imap.fetch(uids, options);
      const messages: any[] = [];

      fetch.on('message', (msg, seqno) => {
        let buffer = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('end', () => {
          messages.push({
            uid: seqno,
            raw: buffer,
          });
        });
      });

      fetch.once('error', (err) => {
        reject(err);
      });

      fetch.once('end', () => {
        resolve(messages);
      });
    });
  }

  private async parseEmail(rawEmail: string): Promise<any> {
    try {
      const parsed = await simpleParser(rawEmail);
      return parsed;
    } catch (error) {
      console.error('Error parsing email:', error);
      throw error;
    }
  }

  public async get(id: string): Promise<IGetThreadResponse> {
    return this.withErrorHandler('get', async () => {
      await this.connectImap();

      // Extract mailbox and UID from ID (format: mailbox:uid)
      const parts = id.split(':');
      const mailbox = parts[0] || 'INBOX';
      const uid = parseInt(parts[1], 10);

      await this.openMailbox(mailbox);

      // Fetch the email with the specific UID
      const messages = await this.fetchMessages([uid], {
        bodies: '',
        struct: true,
        markSeen: true,
      });

      if (!messages || messages.length === 0) {
        throw new Error('Message not found');
      }

      // Parse the email
      const parsedEmail = await this.parseEmail(messages[0].raw);

      // Convert to our app's message format
      const parsedMessage = this.convertToAppMessage(parsedEmail, id, mailbox);

      // Check if it has unread status
      const hasUnread = parsedMessage.unread;

      return {
        messages: [parsedMessage],
        latest: parsedMessage,
        hasUnread,
        totalReplies: 1, // For IMAP, each message is treated individually
        labels: [], // IMAP doesn't have Gmail-style labels
      };
    });
  }

  // Convert parsed email to our app's message format
  private convertToAppMessage(email: any, id: string, mailbox: string): ParsedMessage {
    const from = email.from as AddressObject;
    const to = email.to as AddressObject;
    const cc = email.cc as AddressObject;

    const sender = from
      ? {
          name: from.value[0]?.name || '',
          email: from.value[0]?.address || '',
        }
      : { name: '', email: '' };

    const toRecipients = to
      ? to.value.map((addr: any) => ({
          name: addr.name || '',
          email: addr.address || '',
        }))
      : [];

    const ccRecipients = cc
      ? cc.value.map((addr: any) => ({
          name: addr.name || '',
          email: addr.address || '',
        }))
      : null;

    // Generate a more unique ID if needed
    const messageId = email.messageId || id;
    const threadId = email.messageId || id;

    return {
      id,
      threadId,
      title: email.subject || '(no subject)',
      body: '',
      decodedBody: email.html || email.textAsHtml || email.text || '',
      processedHtml: email.html || email.textAsHtml || email.text || '',
      blobUrl: '',
      messageId,
      tls: true, // Default to true since we're using TLS for IMAP
      references: email.references || '',
      inReplyTo: email.inReplyTo || '',
      sender,
      unread: !email.flags || !email.flags.includes('\\Seen'),
      to: toRecipients,
      cc: ccRecipients,
      receivedOn: email.date?.toString() || new Date().toString(),
      subject: email.subject || '(no subject)',
      attachments: (email.attachments || []).map((att: any) => ({
        filename: att.filename,
        mimeType: att.contentType,
        size: att.size,
        attachmentId: att.contentId || att.filename,
        headers: [],
        body: att.content.toString('base64'),
      })),
      totalReplies: 1, // Each email is its own message in IMAP (no threading)
      tags: [
        {
          id: mailbox,
          name: mailbox,
          type: 'folder',
        },
      ], // Convert folder to tag
    };
  }

  private normalizeMailbox(folder: string): string {
    // Map folder names to IMAP mailbox names
    switch (folder.toLowerCase()) {
      case 'inbox':
        return 'INBOX';
      case 'sent':
        return 'Sent';
      case 'drafts':
        return 'Drafts';
      case 'bin':
      case 'trash':
        return 'Trash';
      case 'spam':
        return 'Spam';
      case 'archive':
        return 'Archive';
      default:
        return folder;
    }
  }

  public async list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }): Promise<{ threads: { id: string; $raw?: unknown }[]; nextPageToken: string | null }> {
    const { folder, query: q, maxResults = 100, pageToken } = params;

    return this.withErrorHandler('list', async () => {
      await this.connectImap();

      const normalizedMailbox = this.normalizeMailbox(folder);
      await this.openMailbox(normalizedMailbox);

      // Parse the page token (format: "lastUID:maxResults")
      let startUid = 1;
      if (pageToken && typeof pageToken === 'string') {
        const parts = pageToken.split(':');
        startUid = parseInt(parts[0], 10);
      }

      // Search criteria
      const criteria: any[] = ['ALL'];
      if (q) {
        criteria.push(['SUBJECT', q]); // Simple query implementation - can be extended
      }

      // Get message UIDs
      const uids = await this.searchEmails(criteria);

      // Sort UIDs in descending order (newest first)
      const sortedUids = [...uids].sort((a, b) => b - a);

      // Paginate results
      const paginatedUids = sortedUids.slice(0, maxResults);

      // Fetch messages with basic header info
      const messages = await this.fetchMessages(paginatedUids, {
        bodies: 'HEADER',
        struct: true,
      });

      // Parse messages
      const parsedMessages = await Promise.all(
        messages.map(async (message) => {
          const parsed = await this.parseEmail(message.raw);

          // Create thread-like object
          return {
            id: `${normalizedMailbox}:${message.uid}`,
            $raw: parsed,
          };
        }),
      );

      // Determine next page token
      let nextPageToken: string | null = null;
      if (sortedUids.length > maxResults) {
        const lastUid = paginatedUids[paginatedUids.length - 1] - 1;
        nextPageToken = `${lastUid}:${maxResults}`;
      }

      return {
        threads: parsedMessages,
        nextPageToken,
      };
    });
  }

  public async create(data: IOutgoingMessage): Promise<{ id?: string | null }> {
    return this.withErrorHandler('create', async () => {
      // Prepare email message
      const emailContent = await this.prepareEmail(data);

      // Send email
      const result = await this.smtp.sendMail(emailContent);

      // Save to Sent folder
      await this.saveSentEmail(emailContent);

      return { id: result.messageId };
    });
  }

  private async saveSentEmail(message: nodemailer.SendMailOptions): Promise<void> {
    try {
      await this.connectImap();
      await this.openMailbox('Sent');

      // Convert the message to MIME format
      const raw = await this.smtp.sendMail({
        ...message,
        envelope: {
          from: message.from,
          to: typeof message.to === 'string' ? [message.to] : message.to,
        },
      });

      // Append to Sent folder
      // Note: This is a simplified approach - a real implementation would use the IMAP append command
      console.log('Email added to Sent folder', raw.messageId);
    } catch (error) {
      console.error('Failed to save email to Sent folder:', error);
    }
  }

  private async prepareEmail(data: IOutgoingMessage): Promise<nodemailer.SendMailOptions> {
    // Sanitize HTML content
    const messageContent = await sanitizeTipTapHtml(data.message);

    // Prepare recipient lists
    const toRecipients = data.to.map((recipient) =>
      recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
    );

    const ccRecipients = data.cc?.map((recipient) =>
      recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
    );

    const bccRecipients = data.bcc?.map((recipient) =>
      recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
    );

    // Prepare attachments
    const attachments = await Promise.all(
      (data.attachments || []).map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return {
          filename: file.name,
          content: buffer,
          contentType: file.type || 'application/octet-stream',
        };
      }),
    );

    // Build email message
    const emailContent: nodemailer.SendMailOptions = {
      from: data.fromEmail || this.config.auth.email,
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject: data.subject,
      html: messageContent,
      attachments,
    };

    // Add custom headers if specified
    if (data.headers && Object.keys(data.headers).length > 0) {
      const headers: Record<string, string> = {};

      for (const [key, value] of Object.entries(data.headers)) {
        if (value) headers[key] = value.toString();
      }

      emailContent.headers = headers;
    }

    return emailContent;
  }

  public async delete(id: string): Promise<void> {
    return this.withErrorHandler('delete', async () => {
      await this.connectImap();

      // Extract mailbox and UID from ID (format: mailbox:uid)
      const parts = id.split(':');
      const mailbox = parts[0] || 'INBOX';
      const uid = parseInt(parts[1], 10);

      await this.openMailbox(mailbox);

      // Move to Trash or mark as deleted
      return new Promise((resolve, reject) => {
        this.imap.move([uid], 'Trash', (err) => {
          if (err) {
            // If move fails, try to add delete flag
            this.imap.addFlags([uid], '\\Deleted', (err2) => {
              if (err2) reject(err2);
              else resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });
  }

  public normalizeIds(ids: string[]): { threadIds: string[] } {
    // In IMAP, we don't have thread IDs like in Gmail
    // So we simply return the IDs as-is
    return { threadIds: ids };
  }

  public async modifyLabels(
    messageIds: string[],
    options: { addLabels: string[]; removeLabels: string[] },
  ): Promise<void> {
    // IMAP doesn't support labels like Gmail, but we can implement folder moves
    return this.withErrorHandler('modifyLabels', async () => {
      await this.connectImap();

      for (const id of messageIds) {
        // Extract mailbox and UID from ID
        const parts = id.split(':');
        const currentMailbox = parts[0];
        const uid = parseInt(parts[1], 10);

        if (options.addLabels.length > 0) {
          // In IMAP, "adding a label" means moving to a folder
          const targetFolder = options.addLabels[0]; // Use the first label as the target folder

          await this.openMailbox(currentMailbox);

          // Move the message to the target folder
          await new Promise<void>((resolve, reject) => {
            this.imap.move([uid], targetFolder, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      }
    });
  }

  public async markAsRead(threadIds: string[]): Promise<void> {
    return this.withErrorHandler('markAsRead', async () => {
      await this.connectImap();

      for (const id of threadIds) {
        // Extract mailbox and UID from ID
        const parts = id.split(':');
        const mailbox = parts[0];
        const uid = parseInt(parts[1], 10);

        await this.openMailbox(mailbox);

        // Mark as read by adding the \Seen flag
        await new Promise<void>((resolve, reject) => {
          this.imap.addFlags([uid], '\\Seen', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    });
  }

  public async markAsUnread(threadIds: string[]): Promise<void> {
    return this.withErrorHandler('markAsUnread', async () => {
      await this.connectImap();

      for (const id of threadIds) {
        // Extract mailbox and UID from ID
        const parts = id.split(':');
        const mailbox = parts[0];
        const uid = parseInt(parts[1], 10);

        await this.openMailbox(mailbox);

        // Mark as unread by removing the \Seen flag
        await new Promise<void>((resolve, reject) => {
          this.imap.delFlags([uid], '\\Seen', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    });
  }

  public async createDraft(
    data: CreateDraftData,
  ): Promise<{ id?: string | null; success?: boolean; error?: string }> {
    return this.withErrorHandler('createDraft', async () => {
      await this.connectImap();

      // Prepare email content
      const messageContent = await sanitizeTipTapHtml(data.message || '');

      // Create email content
      const draft = {
        from: this.config.auth.email,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        html: messageContent,
      };

      // Process attachments if any
      if (data.attachments && data.attachments.length > 0) {
        draft.attachments = await Promise.all(
          data.attachments.map(async (file) => {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            return {
              filename: file.name,
              content: buffer,
              contentType: file.type,
            };
          }),
        );
      }

      // Save to Drafts folder
      await this.openMailbox('Drafts');

      // Generate a message ID for the draft
      const draftId = `draft-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      // In a real implementation, you would use the IMAP APPEND command
      // This is a simplified version that would need to be expanded
      console.log('Draft created with ID:', draftId);

      return {
        id: draftId,
        success: true,
      };
    });
  }

  public async getDraft(id: string): Promise<ParsedDraft> {
    return this.withErrorHandler('getDraft', async () => {
      await this.connectImap();
      await this.openMailbox('Drafts');

      // Extract UID from ID
      const uid = parseInt(id.split(':')[1], 10);

      // Fetch draft message
      const messages = await this.fetchMessages([uid], {
        bodies: '',
        struct: true,
      });

      if (!messages || messages.length === 0) {
        throw new Error('Draft not found');
      }

      // Parse the draft
      const parsedEmail = await this.parseEmail(messages[0].raw);

      // Convert to ParsedDraft format
      return {
        id: id,
        to: parsedEmail.to?.value?.map((addr: any) => addr.address) || [],
        subject: parsedEmail.subject || '',
        content: parsedEmail.html || parsedEmail.textAsHtml || parsedEmail.text || '',
        rawMessage: parsedEmail,
      };
    });
  }

  public async listDrafts(params: {
    q?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    threads: { id: string; $raw: unknown }[];
    nextPageToken: string | null;
  }> {
    const { q, maxResults = 100, pageToken } = params;

    return this.withErrorHandler('listDrafts', async () => {
      await this.connectImap();
      await this.openMailbox('Drafts');

      // Search criteria
      const criteria: any[] = ['ALL'];
      if (q) {
        criteria.push(['SUBJECT', q]);
      }

      // Parse page token
      let startUid = 1;
      if (pageToken) {
        startUid = parseInt(pageToken, 10);
      }

      // Get message UIDs
      const uids = await this.searchEmails(criteria);

      // Sort UIDs in descending order (newest first)
      const sortedUids = [...uids].sort((a, b) => b - a);

      // Paginate results
      const paginatedUids = sortedUids.slice(0, maxResults);

      // Fetch drafts
      const messages = await this.fetchMessages(paginatedUids, {
        bodies: 'HEADER',
        struct: true,
      });

      // Parse drafts
      const drafts = await Promise.all(
        messages.map(async (message) => {
          const parsed = await this.parseEmail(message.raw);

          return {
            id: `Drafts:${message.uid}`,
            $raw: parsed,
          };
        }),
      );

      // Determine next page token
      let nextPageToken: string | null = null;
      if (sortedUids.length > maxResults) {
        const lastUid = paginatedUids[paginatedUids.length - 1] - 1;
        nextPageToken = lastUid.toString();
      }

      return {
        threads: drafts,
        nextPageToken,
      };
    });
  }

  public async sendDraft(id: string, data: IOutgoingMessage): Promise<void> {
    return this.withErrorHandler('sendDraft', async () => {
      // Prepare and send the email
      const emailContent = await this.prepareEmail(data);
      await this.smtp.sendMail(emailContent);

      // Delete the draft
      await this.delete(id);
    });
  }

  public async count(): Promise<{ count?: number; label?: string }[]> {
    return this.withErrorHandler('count', async () => {
      await this.connectImap();

      // List of folders to check
      const folders = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive'];

      const counts = await Promise.all(
        folders.map(async (folder) => {
          try {
            await this.openMailbox(folder);

            return new Promise<{ count?: number; label?: string }>((resolve, reject) => {
              // Get box status
              const box = this.imap._box;
              if (box) {
                resolve({
                  label: folder,
                  count: box.messages.total,
                });
              } else {
                resolve({
                  label: folder,
                  count: 0,
                });
              }
            });
          } catch (error) {
            // If folder doesn't exist
            return {
              label: folder,
              count: 0,
            };
          }
        }),
      );

      return counts;
    });
  }

  public async getTokens(
    code: string,
  ): Promise<{ tokens: { access_token?: string; refresh_token?: string; expiry_date?: number } }> {
    // IMAP doesn't use OAuth typically, but we implement for interface compatibility
    return {
      tokens: {
        access_token: 'imap-direct-access',
        refresh_token: 'imap-no-refresh-token',
        expiry_date: Date.now() + 365 * 24 * 60 * 60 * 1000, // Set a far future expiry
      },
    };
  }

  public async getUserInfo(
    tokens?: ManagerConfig['auth'],
  ): Promise<{ address: string; name: string; photo: string }> {
    // For IMAP, we just return the email address
    return {
      address: tokens?.email || this.config.auth.email,
      name: '', // No way to get name from IMAP
      photo: '', // No way to get photo from IMAP
    };
  }

  public async getAttachment(messageId: string, attachmentId: string): Promise<string | undefined> {
    return this.withErrorHandler('getAttachment', async () => {
      // Extract mailbox and UID from ID
      const parts = messageId.split(':');
      const mailbox = parts[0];
      const uid = parseInt(parts[1], 10);

      await this.connectImap();
      await this.openMailbox(mailbox);

      // Fetch the message
      const messages = await this.fetchMessages([uid], {
        bodies: '',
        struct: true,
      });

      if (!messages || messages.length === 0) {
        throw new Error('Message not found');
      }

      // Parse the email
      const parsedEmail = await this.parseEmail(messages[0].raw);

      // Find the attachment
      const attachment = parsedEmail.attachments.find(
        (att: any) => att.contentId === attachmentId || att.filename === attachmentId,
      );

      if (!attachment) {
        return undefined;
      }

      // Return attachment content as base64
      return attachment.content.toString('base64');
    });
  }

  public async getUserLabels(): Promise<Label[]> {
    return this.withErrorHandler('getUserLabels', async () => {
      await this.connectImap();

      // List mailboxes
      const mailboxes: string[] = await new Promise((resolve, reject) => {
        this.imap.getBoxes((err, boxes) => {
          if (err) {
            reject(err);
            return;
          }

          // Extract mailbox names
          const names: string[] = [];
          const extractBoxes = (prefix: string, boxObj: any) => {
            Object.entries(boxObj).forEach(([name, box]: [string, any]) => {
              const fullName = prefix ? `${prefix}${name}` : name;
              names.push(fullName);

              if (box.children) {
                extractBoxes(`${fullName}/`, box.children);
              }
            });
          };

          extractBoxes('', boxes);
          resolve(names);
        });
      });

      // Convert mailboxes to labels
      return mailboxes.map((name) => ({
        id: name,
        name: name,
        type: 'folder',
      }));
    });
  }

  public async getLabel(id: string): Promise<Label> {
    // In IMAP, labels are just mailboxes
    return {
      id,
      name: id,
      type: 'folder',
    };
  }

  public async createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<void> {
    return this.withErrorHandler('createLabel', async () => {
      await this.connectImap();

      // Create a new mailbox
      await new Promise<void>((resolve, reject) => {
        this.imap.addBox(label.name, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  public async updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void> {
    return this.withErrorHandler('updateLabel', async () => {
      await this.connectImap();

      // Rename the mailbox
      if (id !== label.name) {
        await new Promise<void>((resolve, reject) => {
          this.imap.renameBox(id, label.name, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    });
  }

  public async deleteLabel(id: string): Promise<void> {
    return this.withErrorHandler('deleteLabel', async () => {
      await this.connectImap();

      // Delete the mailbox
      await new Promise<void>((resolve, reject) => {
        this.imap.delBox(id, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  public async getEmailAliases(): Promise<{ email: string; name?: string; primary?: boolean }[]> {
    // IMAP doesn't support email aliases directly
    return [
      {
        email: this.config.auth.email,
        primary: true,
      },
    ];
  }

  public async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    // IMAP doesn't use refresh tokens
    return true;
  }

  private async withErrorHandler<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.error(`Error in IMAP operation ${operation}:`, error);

      // Connection errors
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND'
      ) {
        throw new StandardizedError({
          code: 'CONNECTION_REFUSED',
          status: 503,
          operation,
          message: `Connection to IMAP server failed: ${error.message}`,
          context: sanitizeContext({ ...context, error }),
          fatal: true,
        });
      }

      // Authentication errors
      if (error.code === 'AUTHENTICATIONFAILED' || error.code === 'INVALIDCREDENTIALS') {
        const err = new StandardizedError({
          code: 'AUTHENTICATION_ERROR',
          status: 401,
          operation,
          message: 'IMAP authentication failed. Please check your credentials.',
          context: sanitizeContext({ ...context, error }),
          fatal: true,
        });

        // Delete the connection since credentials are invalid
        if (this.config.auth?.userId) {
          await deleteActiveConnection(this.config.auth.userId);
        }

        throw err;
      }

      // TLS/SSL errors
      if (error.code === 'ETLSNOTCAPABLE' || error.code === 'ESSLNOTCAPABLE') {
        throw new StandardizedError({
          code: 'TLS_ERROR',
          status: 502,
          operation,
          message: 'The IMAP server does not support secure connections.',
          context: sanitizeContext({ ...context, error }),
          fatal: false,
        });
      }

      // Quota errors
      if (error.message?.includes('quota') || error.message?.includes('storage')) {
        throw new StandardizedError({
          code: 'QUOTA_ERROR',
          status: 507,
          operation,
          message: 'Email storage quota exceeded.',
          context: sanitizeContext({ ...context, error }),
          fatal: false,
        });
      }

      // SMTP specific errors
      if (error.code?.startsWith('SMTP')) {
        throw new StandardizedError({
          code: 'SMTP_ERROR',
          status: 502,
          operation,
          message: `Email sending failed: ${error.message}`,
          context: sanitizeContext({ ...context, error }),
          fatal: false,
        });
      }

      // Server capability errors
      if (error.message?.includes('not supported') || error.message?.includes('capability')) {
        throw new StandardizedError({
          code: 'CAPABILITY_ERROR',
          status: 501,
          operation,
          message: `The IMAP server doesn't support required features: ${error.message}`,
          context: sanitizeContext({ ...context, error }),
          fatal: false,
        });
      }

      // Generic error handling for all other cases
      const standardError = new StandardizedError({
        code: 'UNKNOWN_IMAP_ERROR',
        status: 500,
        operation,
        message: `IMAP operation ${operation} failed: ${error.message || error}`,
        context: sanitizeContext({ ...context, error }),
        fatal: FatalErrors.includes(error?.code) || FatalErrors.includes(error?.response?.status),
      });

      throw standardError;
    }
  }
}
