'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { Me } from '@nothingleft/types';
import type { ShellData } from '@hooks/use-shell-data';
import { Button } from '@components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@components/ui/sheet';
import { Sidebar } from '@components/shell/sidebar';

export function MobileNavigation({ user, data }: { user: Me | null; data: ShellData }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="md:hidden">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        className="h-dvh w-[min(320px,calc(100vw-32px))] gap-0 bg-app"
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <SheetTitle>Navigation</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close navigation">
              <X className="size-5" />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1">
          <Sidebar
            collapsed={false}
            onToggle={() => setOpen(false)}
            user={user}
            data={data}
            mobile
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
