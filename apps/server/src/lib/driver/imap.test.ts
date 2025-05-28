import { ImapMailManager } from './imap';
import { ManagerConfig } from './types';

// Mock the dependencies
jest.mock('imap');
jest.mock('nodemailer');
jest.mock('./utils', () => ({
  deleteActiveConnection: jest.fn(),
  sanitizeContext: jest.fn((ctx) => ctx),
  FatalErrors: ['invalid_grant', 'invalid_credentials'],
  StandardizedError: class StandardizedError extends Error {
    constructor(public details: any) {
      super(details.message);
      Object.assign(this, details);
    }
  },
}));

describe('IMAP Mail Manager', () => {
  let imapManager: ImapMailManager;
  const mockConfig: ManagerConfig = {
    auth: {
      userId: 'test-user',
      accessToken: 'test-password',
      refreshToken: '',
      email: 'test@example.com',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    imapManager = new ImapMailManager(mockConfig);
  });

  test('should initialize with correct configuration', () => {
    // @ts-ignore - Accessing private property for testing
    expect(imapManager.config).toEqual(mockConfig);
  });

  test('should determine correct IMAP server for common providers', () => {
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getImapHost('user@gmail.com')).toBe('imap.gmail.com');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getImapHost('user@outlook.com')).toBe('outlook.office365.com');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getImapHost('user@yahoo.com')).toBe('imap.mail.yahoo.com');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getImapHost('user@custom.com')).toBe('imap.custom.com');
  });

  test('should determine correct SMTP server for common providers', () => {
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getSmtpHost('user@gmail.com')).toBe('smtp.gmail.com');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getSmtpHost('user@outlook.com')).toBe('smtp.office365.com');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getSmtpHost('user@yahoo.com')).toBe('smtp.mail.yahoo.com');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.getSmtpHost('user@custom.com')).toBe('smtp.custom.com');
  });

  test('should return scope string', () => {
    expect(imapManager.getScope()).toBe('imap smtp');
  });

  test('should handle authentication errors correctly', async () => {
    // @ts-ignore - Setting up mock for private method
    imapManager.connectImap = jest.fn().mockRejectedValue({
      code: 'AUTHENTICATIONFAILED',
      message: 'Invalid credentials',
    });

    await expect(
      imapManager.list({
        folder: 'INBOX',
        maxResults: 10,
      }),
    ).rejects.toThrow('IMAP authentication failed');
  });

  test('should handle connection errors correctly', async () => {
    // @ts-ignore - Setting up mock for private method
    imapManager.connectImap = jest.fn().mockRejectedValue({
      code: 'ECONNREFUSED',
      message: 'Connection refused',
    });

    await expect(
      imapManager.list({
        folder: 'INBOX',
        maxResults: 10,
      }),
    ).rejects.toThrow('Connection to IMAP server failed');
  });

  test('normalizeMailbox should map folder names correctly', () => {
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.normalizeMailbox('inbox')).toBe('INBOX');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.normalizeMailbox('sent')).toBe('Sent');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.normalizeMailbox('trash')).toBe('Trash');
    // @ts-ignore - Accessing private method for testing
    expect(imapManager.normalizeMailbox('custom')).toBe('custom');
  });
});
