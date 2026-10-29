import type { Metadata } from 'next';

export interface AuthCard {
  category: string;
  title: [string, string];
  lede: string;
  scene: { heading: string; steps: [string, string, string]; footer: string };
}

interface AuthPage {
  title: string;
  description: string;
  imageAlt: string;
  card: AuthCard;
}

// The card is the page's link preview, rendered at build time by app/og/[card]/route.ts.
export const AUTH_PAGES = {
  'sign-in': {
    title: 'Sign In | Nothing Left Project Management',
    description:
      'Sign in to Nothing Left to track issues, plan sprints, and keep project decisions together. Pick up where you left off with your team and AI agents.',
    imageAlt: 'Welcome back. Sign in to your Nothing Left workspace.',
    card: {
      category: 'Sign in',
      title: ['Welcome', 'back'],
      lede: 'Sign in and pick up where you left off.',
      scene: {
        heading: 'Your workspace',
        steps: ['Find your next issue', 'Keep decisions together', 'Move the work forward'],
        footer: 'Everything in its place.',
      },
    },
  },
  'sign-up': {
    title: 'Sign Up | Nothing Left Open-Source Project Management',
    description:
      'Create your Nothing Left account for open-source project management. Track issues, plan sprints, and collaborate with your team and AI agents.',
    imageAlt: 'Create your account. Start working with your team on Nothing Left.',
    card: {
      category: 'Sign up',
      title: ['Create your', 'account'],
      lede: 'A place for your team, your issues, and your next idea.',
      scene: {
        heading: 'Getting started',
        steps: ['Create your account', 'Set up your first project', 'Bring your team together'],
        footer: 'Good work starts here.',
      },
    },
  },
  'reset-password': {
    title: 'Reset Your Password | Nothing Left',
    description:
      'Reset your Nothing Left password with a single-use email link. Choose a new password, sign in, and return to your projects and team.',
    imageAlt: 'Reset your password and return to your Nothing Left workspace.',
    card: {
      category: 'Account recovery',
      title: ['Reset your', 'password'],
      lede: 'Get a reset link and return to your workspace.',
      scene: {
        heading: 'Back to your workspace',
        steps: ['Request a reset link', 'Choose a new password', 'Sign in to your account'],
        footer: 'A fresh start for your sign-in.',
      },
    },
  },
  invite: {
    title: 'Join Your Team | Nothing Left',
    description:
      'Join your team on Nothing Left. Review your workspace invitation, sign in or create an account, and collaborate on issues, sprints, and project knowledge.',
    imageAlt: 'Your team is waiting. Join your team on Nothing Left.',
    card: {
      category: 'Invitation',
      title: ['Your team', 'is waiting'],
      lede: 'Join your team on Nothing Left and start working together.',
      scene: {
        heading: 'Join your team',
        steps: ['Review your invitation', 'Sign in or create an account', "Join your team's workspace"],
        footer: 'One place for the work.',
      },
    },
  },
} satisfies Record<string, AuthPage>;

export type AuthPageKey = keyof typeof AUTH_PAGES;

export const isAuthPage = (page: string): page is AuthPageKey => Object.hasOwn(AUTH_PAGES, page);

export const authCardPath = (page: AuthPageKey) => `/og/${page}.png`;

export function authPageMetadata(page: AuthPageKey): Metadata {
  const { title, description, imageAlt } = AUTH_PAGES[page];
  const indexable = page === 'sign-in' || page === 'sign-up';
  const image = { url: authCardPath(page), width: 1200, height: 630, type: 'image/png', alt: imageAlt };
  return {
    title: { absolute: title },
    description,
    robots: { index: indexable, follow: true },
    // Canonical public entry points exclude redirect parameters. Invitation and
    // password-reset tokens are never included in share metadata.
    ...(indexable ? { alternates: { canonical: `/${page}` } } : {}),
    openGraph: {
      title,
      description,
      siteName: 'Nothing Left',
      type: 'website',
      ...(indexable ? { url: `/${page}` } : {}),
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: image.url, alt: imageAlt }] },
  };
}
