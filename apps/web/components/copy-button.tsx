'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';

export function CopyButton({ value, what, label = 'Copy' }: { value: string; what: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success(`${what} copied.`);
      }}
    >
      {copied ? <Check className="size-icon-sm" /> : <Copy className="size-icon-sm" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}
