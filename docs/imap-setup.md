# IMAP Connection Setup

This guide helps you configure email accounts with Zero using the IMAP protocol.

## Basic Setup

1. Go to Settings > Connections
2. Click the "Add Account" button
3. Select "IMAP" from the provider list
4. Enter your email address and password
5. Click "Connect IMAP Account"

Zero will try to auto-detect your IMAP and SMTP server settings based on your email domain. For most popular email providers (Gmail, Yahoo, Outlook, etc.), this works automatically.

## Advanced Configuration

If the automatic configuration doesn't work or you're using a custom email provider, expand the "Advanced Settings" section to manually set:

- IMAP Server: The hostname of your IMAP server (e.g., imap.example.com)
- IMAP Port: Usually 993 for secure connections
- SMTP Server: The hostname of your SMTP server (e.g., smtp.example.com)
- SMTP Port: Usually 465 for secure connections

## Gmail-Specific Instructions

For Gmail accounts, you'll need to use an "App Password" rather than your regular Google account password:

1. Go to your [Google Account](https://myaccount.google.com/)
2. Select Security
3. Under "Signing in to Google," select 2-Step Verification
4. At the bottom of the page, select App passwords
5. Enter "Zero Email" as the app name
6. Click "Create"
7. Use the generated 16-character password for connecting to Zero

## Yahoo-Specific Instructions

Yahoo requires an app password:

1. Go to your [Yahoo Account Security Settings](https://login.yahoo.com/account/security)
2. Click "Generate app password"
3. Select "Other app" and name it "Zero Email"
4. Use the generated password for connecting to Zero

## Outlook/Hotmail-Specific Instructions

Outlook/Hotmail requires an app password if you have 2FA enabled:

1. Go to your [Microsoft Account Security Settings](https://account.live.com/proofs/Manage)
2. Click "Create a new app password"
3. Use the generated password for connecting to Zero

## Troubleshooting

If you encounter connection issues:

1. Double-check your email and password
2. Ensure you're using an app password if required by your provider
3. Verify the IMAP/SMTP server settings in the advanced configuration
4. Check if your email provider requires any special settings or permissions for IMAP access
5. Some providers may require you to explicitly enable IMAP access in your account settings

## Security Note

Zero stores your email credentials securely. However, for optimal security, we recommend:

1. Using app-specific passwords whenever possible
2. Regularly updating passwords
3. Checking your email account's security settings for any suspicious activity
