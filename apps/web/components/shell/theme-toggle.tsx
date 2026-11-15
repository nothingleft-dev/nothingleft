'use client';

import { Check, Moon, Sun, SunMoon } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { UserTheme } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { useUpdatePreferences } from '@hooks/use-me';

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: SunMoon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const persist = useUpdatePreferences();
  const chosen = theme ?? 'system';

  // Both copies move together: localStorage renders without a round trip, the account row
  // carries the choice to the next device.
  const choose = (next: UserTheme) => {
    setTheme(next);
    persist.mutate({ theme: next });
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Theme">
              {chosen === 'system' ? (
                <SunMoon className="size-icon" />
              ) : (
                <>
                  <Sun className="size-icon dark:hidden" />
                  <Moon className="hidden size-icon dark:block" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            role="menuitemradio"
            aria-checked={chosen === value}
            onSelect={() => choose(value)}
          >
            <Icon className="size-icon-sm" />
            <span className="flex-1">{label}</span>
            {chosen === value ? <Check className="size-icon-sm" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
