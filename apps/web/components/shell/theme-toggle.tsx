'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { UserTheme } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { useUpdatePreferences } from '@hooks/use-me';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const persist = useUpdatePreferences();

  // Both copies move together: localStorage renders without a round trip, the account row
  // carries the choice to the next device.
  const choose = (next: string) => {
    setTheme(next);
    persist.mutate({ theme: next as UserTheme });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Sun className="size-icon dark:hidden" />
          <Moon className="hidden size-icon dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={choose}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-icon-sm" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-icon-sm" /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-icon-sm" /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
