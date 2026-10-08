import type { Metadata } from 'next';

const AUTH_PAGES = {
  'sign-in': {
    title: 'Sign In | Nothing Left Project Management',
    description:
      'Sign in to Nothing Left to track issues, plan sprints, and keep project decisions together. Pick up where you left off with your team and AI agents.',
    imageAlt: 'Welcome back. Sign in to your Nothing Left workspace.',
  },
  'sign-up': {
    title: 'Sign Up | Nothing Left Open-Source Project Management',
    description:
      'Create your Nothing Left account for open-source project management. Track issues, plan sprints, and collaborate with your team and AI agents.',
    imageAlt: 'Create your account. Start working with your team on Nothing Left.',
  },
  'reset-password': {
    title: 'Reset Your Password | Nothing Left',
    description:
      'Reset your Nothing Left password with a single-use email link. Choose a new password, sign in, and return to your projects and team.',
    imageAlt: 'Reset your password and return to your Nothing Left workspace.',
  },
  invite: {
    title: 'Join Your Team | Nothing Left',
    description:
      'Join your team on Nothing Left. Review your workspace invitation, sign in or create an account, and collaborate on issues, sprints, and project knowledge.',
    imageAlt: 'Your team is waiting. Join your team on Nothing Left.',
  },
} as const;

export function authPageMetadata(page: keyof typeof AUTH_PAGES): Metadata {
  const { title, description, imageAlt } = AUTH_PAGES[page];
  const indexable = page === 'sign-in' || page === 'sign-up';
  const image = {
    url: `https://static.nothingleft.dev/admin/${page}.png`,
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: imageAlt,
  };

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
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: image.url, alt: imageAlt }],
    },
  };
}
