export interface FaqLink {
  href: string;
  label: string;
  external?: boolean;
}

export interface FaqEntry {
  question: string;
  answer: string[];
  link?: FaqLink;
}

export const HOME_FAQ: FaqEntry[] = [
  {
    question: 'Do we need an AI agent to use it?',
    answer: [
      'No. It is a complete web app for issues, sprints, time, reports and project knowledge. Agent access is there when you want it, through a token you create and can revoke.',
    ],
  },
  {
    question: 'What happens when we join the beta?',
    answer: [
      "You sign up with Google, GitHub or an email address, name your organisation and create a first project; the key is derived from its initials and you can change it. Inviting people is a step you can skip. You land on the project's issue list, usually within a few minutes. There is no approval queue.",
    ],
  },
  {
    question: 'Can we try it on one project first?',
    answer: [
      'Yes. Create an organisation and a single project, invite people later, connect an agent later or never. Issues export to CSV at any time, so a trial does not lock anything in.',
    ],
  },
  {
    question: 'What stays free?',
    answer: [
      'No subscription charge for any team size during beta. The first 20 members of every organisation stay free forever once billing exists. We will give notice before charging for seats beyond that; nothing is priced today.',
    ],
    link: { href: '/pricing', label: 'Pricing' },
  },
  {
    question: 'How does file storage work?',
    answer: [
      'Each organisation has 5 GB of platform storage for attachments; avatars do not count. You see usage at 80% and 95% before anything is refused. Connect your own Cloudflare R2 or AWS S3 bucket and the limit lifts the moment the bucket is verified.',
    ],
    link: { href: '/docs/limits-and-billing', label: 'Limits and storage' },
  },
  {
    question: 'Can we self-host?',
    answer: [
      'Yes. The code is AGPL-3.0 and the hosted service runs the same build: PostgreSQL, S3-compatible storage, the web app, the API and the MCP server. Seat and storage limits are environment settings you can change. One Docker Compose command runs all of it, and a second guide covers AWS.',
    ],
    link: { href: '/docs/self-hosting', label: 'Self-hosting guide' },
  },
  {
    question: 'Which integrations exist today?',
    answer: [
      'MCP for any agent client, over HTTP or locally over stdio. GitHub and GitLab: branches, commits and pull requests linked to issues by key, with review and CI state on the issue, and status rules that move an issue on a branch, a pull request or a merge. Google and GitHub sign-in. CSV export and generic CSV import.',
      'Not built yet: deployment status on issues, outgoing webhooks, native importers from other trackers, Bitbucket, and general workflow rules beyond those status rules. An agent connected to both your old tracker and this one can help carry issues across, with you reviewing the mapping.',
    ],
    link: { href: '/features/git-integration', label: 'GitHub and GitLab' },
  },
  {
    question: 'What is deliberately left out?',
    answer: [
      'A workflow or transition-rules engine: any status may follow any status, and automations only set a status when git work or subtasks move. Custom roles and permission schemes: there are five built-in roles. Per-comment visibility: comments follow the issue. These keep setup short and the agent surface predictable.',
    ],
  },
];
