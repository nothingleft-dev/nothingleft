import { env } from '@lib/env';

export function EmailUs() {
  if (!env.supportEmail) return <>email us</>;
  return (
    <>
      email{' '}
      <a href={`mailto:${env.supportEmail}`} className="font-medium underline">
        {env.supportEmail}
      </a>
    </>
  );
}
