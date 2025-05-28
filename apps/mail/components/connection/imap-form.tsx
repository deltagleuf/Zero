import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Loader2, Lock, Server, Mail } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { toast } from 'sonner';

export const ImapForm = ({ onClose }: { onClose?: () => void }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    imapServer: '',
    smtpServer: '',
    imapPort: 993,
    smtpPort: 465,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name.includes('Port') ? parseInt(value) || 0 : value,
    }));
  };

  const connectImap = trpc.connections.imap.connect.useMutation({
    onSuccess: () => {
      toast.success('IMAP connection added successfully!');
      onClose?.();
      // Refresh the page to show the new connection
      router.refresh();
    },
    onError: (error) => {
      toast.error(`Failed to connect: ${error.message}`);
      setIsSubmitting(false);
    },
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Auto-detect server settings if not provided
      const domainPart = formData.email.split('@')[1];

      await connectImap.mutateAsync({
        email: formData.email,
        password: formData.password,
        imapServer: formData.imapServer || undefined,
        smtpServer: formData.smtpServer || undefined,
        imapPort: formData.imapPort || undefined,
        smtpPort: formData.smtpPort || undefined,
      });
    } catch (error) {
      // Error is handled by the mutation onError
      setIsSubmitting(false);
    }
  };

  // Auto-populate server settings based on email domain
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setFormData((prev) => ({ ...prev, email }));

    if (email.includes('@')) {
      const domain = email.split('@')[1].toLowerCase();
      let imapServer = '';
      let smtpServer = '';
      let imapPort = 993;
      let smtpPort = 465;

      // Common email providers
      switch (domain) {
        case 'gmail.com':
          imapServer = 'imap.gmail.com';
          smtpServer = 'smtp.gmail.com';
          break;
        case 'outlook.com':
        case 'hotmail.com':
        case 'live.com':
          imapServer = 'outlook.office365.com';
          smtpServer = 'smtp.office365.com';
          break;
        case 'yahoo.com':
          imapServer = 'imap.mail.yahoo.com';
          smtpServer = 'smtp.mail.yahoo.com';
          break;
        case 'aol.com':
          imapServer = 'imap.aol.com';
          smtpServer = 'smtp.aol.com';
          break;
        case 'icloud.com':
          imapServer = 'imap.mail.me.com';
          smtpServer = 'smtp.mail.me.com';
          break;
        default:
          imapServer = `imap.${domain}`;
          smtpServer = `smtp.${domain}`;
      }

      setFormData((prev) => ({
        ...prev,
        imapServer,
        smtpServer,
        imapPort,
        smtpPort,
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="text-muted-foreground absolute left-3 top-3 h-4 w-4" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="your.email@example.com"
            value={formData.email}
            onChange={handleEmailChange}
            className="pl-10"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="text-muted-foreground absolute left-3 top-3 h-4 w-4" />
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Your email password or app password"
            value={formData.password}
            onChange={handleChange}
            className="pl-10"
            required
          />
        </div>
        <p className="text-muted-foreground text-xs">
          For Gmail, use an App Password.{' '}
          <a
            href="https://support.google.com/accounts/answer/185833"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Learn more
          </a>
        </p>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="advanced-settings">
          <AccordionTrigger>Advanced Settings</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="imapServer">IMAP Server</Label>
                <div className="relative">
                  <Server className="text-muted-foreground absolute left-3 top-3 h-4 w-4" />
                  <Input
                    id="imapServer"
                    name="imapServer"
                    placeholder="imap.example.com"
                    value={formData.imapServer}
                    onChange={handleChange}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imapPort">IMAP Port</Label>
                <Input
                  id="imapPort"
                  name="imapPort"
                  type="number"
                  placeholder="993"
                  value={formData.imapPort}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpServer">SMTP Server</Label>
                <div className="relative">
                  <Server className="text-muted-foreground absolute left-3 top-3 h-4 w-4" />
                  <Input
                    id="smtpServer"
                    name="smtpServer"
                    placeholder="smtp.example.com"
                    value={formData.smtpServer}
                    onChange={handleChange}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPort">SMTP Port</Label>
                <Input
                  id="smtpPort"
                  name="smtpPort"
                  type="number"
                  placeholder="465"
                  value={formData.smtpPort}
                  onChange={handleChange}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          'Connect IMAP Account'
        )}
      </Button>
    </form>
  );
};
