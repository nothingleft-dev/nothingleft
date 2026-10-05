import { Building2, SquareKanban, UserPlus, UserRound } from 'lucide-react';
import type { FlowStep } from '@components/onboarding/step-rail';

export const WELCOME_STEPS: readonly FlowStep[] = [
  {
    id: 'profile',
    title: 'Your profile',
    body: 'Confirm your name and time zone.',
    icon: UserRound,
  },
  {
    id: 'organization',
    title: 'Organisation',
    body: 'Name your team’s workspace.',
    icon: Building2,
  },
  {
    id: 'project',
    title: 'First project',
    body: 'Create a place to track work.',
    icon: SquareKanban,
  },
  {
    id: 'invite',
    title: 'Invite people',
    body: 'Add teammates, or skip for now.',
    icon: UserPlus,
  },
];

export const WELCOME_INTRO = 'Set up your workspace in four short steps. You can adjust your settings later.';
