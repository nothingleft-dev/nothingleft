import { Fragment } from 'react';
import { Kbd } from '@components/kbd';
import { SHORTCUTS, type Shortcut, type ShortcutArea } from '@lib/shortcuts';

const AREAS: readonly ShortcutArea[] = ['Anywhere', 'Search', 'Issue list', 'Issue page', 'Knowledge base', 'Editor'];

function Keys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-2xs text-text-muted">
      {shortcut.keys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 ? <span>+</span> : null}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
      {shortcut.then ? (
        <>
          <span>then</span>
          <Kbd>{shortcut.then}</Kbd>
        </>
      ) : null}
    </span>
  );
}

export function ShortcutsTable() {
  return (
    <div className="gap-x-10 sm:columns-2">
      {AREAS.map(area => (
        <section key={area} aria-labelledby={`shortcuts-${area}`} className="mb-6 flex break-inside-avoid flex-col">
          <h2 id={`shortcuts-${area}`} className="pb-1.5 text-sm font-semibold">
            {area}
          </h2>
          <ul className="flex flex-col divide-y divide-border-subtle border-y">
            {SHORTCUTS.filter(s => s.area === area).map(shortcut => (
              <li key={shortcut.action} className="flex h-row items-center justify-between gap-4">
                <span className="text-sm text-text">{shortcut.action}</span>
                <Keys shortcut={shortcut} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
