'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Check, CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import { CSV_IMPORT_MAX_BYTES, CSV_IMPORT_MAX_ROWS, type ImportDryRun, type ImportPreview } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Meter } from '@components/dashboard/meter';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError, errorDetail } from '@components/query-state';
import { ColumnMapping, hasTitle } from '@components/imports/column-mapping';
import {
  Figures,
  ImportErrorsTable,
  GroupHeading,
  ImportProgress,
  ResultFigures,
  UnknownValues,
  issues,
  rows,
  stoppedSummary,
} from '@components/imports/import-results';
import { useCustomFields } from '@hooks/use-custom-fields';
import {
  isImportRunning,
  useDryRunImport,
  useImport,
  useReadImport,
  useRefreshAfterImport,
  useStartImport,
  useUploadImport,
  type UploadPhase,
} from '@hooks/use-imports';
import { cn } from '@lib/utils';
import { formatCount } from '@lib/numbers';
import { PendingButton } from '@components/pending-button';
import { TextButton } from '@components/text-button';

type Step =
  | { kind: 'pick' }
  | { kind: 'uploading'; file: File; phase: UploadPhase; loaded: number; total: number }
  | { kind: 'map'; preview: ImportPreview }
  | { kind: 'started'; id: number };

const STEPS = ['File', 'Columns', 'Dry run', 'Import'] as const;

type Outcome = 'completed' | 'failed' | null;

interface CsvImportFlowProps {
  project: string;
  projectName: string;
  /** An upload left unstarted, picked up again from the recent list. */
  resumeId: number | null;
  onDone: () => void;
}

export function CsvImportFlow({ project, projectName, resumeId, onDone }: CsvImportFlowProps) {
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [checked, setChecked] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const upload = useUploadImport(project);
  const read = useReadImport(project);

  useEffect(() => {
    if (resumeId === null) return;
    read.mutate(resumeId, {
      onSuccess: preview => setStep({ kind: 'map', preview }),
      onError: error => setPickError(error.message),
    });
    // Once per resumed upload; `read` is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setPickError(null);
    const controller = new AbortController();
    abort.current = controller;
    setStep({ kind: 'uploading', file, phase: 'hashing', loaded: 0, total: file.size });
    upload.mutate(
      {
        file,
        signal: controller.signal,
        onPhase: phase => setStep(s => (s.kind === 'uploading' ? { ...s, phase } : s)),
        onProgress: (loaded, total) => setStep(s => (s.kind === 'uploading' ? { ...s, loaded, total } : s)),
      },
      {
        onSuccess: preview => setStep({ kind: 'map', preview }),
        onError: error => {
          setStep({ kind: 'pick' });
          if (!(error instanceof DOMException && error.name === 'AbortError')) setPickError(error.message);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <StepRail
        index={stepIndex(step, checked, outcome)}
        failed={step.kind === 'started' && outcome === 'failed'}
        sticky={step.kind === 'map' || step.kind === 'started'}
      />

      {step.kind === 'pick' ? (
        read.isPending ? (
          <p className="text-sm text-text-secondary" role="status">
            Reading the file again…
          </p>
        ) : (
          <PickStep error={pickError} onPick={pick} />
        )
      ) : null}

      {step.kind === 'uploading' ? <UploadingStep step={step} onCancel={() => abort.current?.abort()} /> : null}

      {step.kind === 'map' ? (
        <MapStep
          project={project}
          projectName={projectName}
          preview={step.preview}
          onChecked={setChecked}
          onRestart={() => setStep({ kind: 'pick' })}
          onStarted={id => setStep({ kind: 'started', id })}
        />
      ) : null}

      {step.kind === 'started' ? (
        <StartedStep
          project={project}
          id={step.id}
          onFinished={setOutcome}
          onAnother={() => {
            setStep({ kind: 'pick' });
            onDone();
          }}
        />
      ) : null}
    </div>
  );
}

function stepIndex(step: Step, checked: boolean, outcome: Outcome) {
  if (step.kind === 'pick' || step.kind === 'uploading') return 0;
  if (step.kind === 'map') return checked ? 2 : 1;
  return outcome === 'completed' ? STEPS.length : 3;
}

/** Whether a sticky element is pinned to the scroll root's top or bottom edge rather than resting in flow. */
function useStuck<T extends HTMLElement>(edge: 'top' | 'bottom') {
  const ref = useRef<T>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.closest<HTMLElement>('[data-scroll-root]');
    const observer = new IntersectionObserver(
      ([entry]) => {
        const bounds = entry?.rootBounds;
        if (!entry || !bounds) return;
        const box = entry.boundingClientRect;
        setStuck(
          entry.intersectionRatio < 1 && (edge === 'top' ? box.top <= bounds.top + 1 : box.bottom >= bounds.bottom - 1),
        );
      },
      { root, threshold: [1], rootMargin: edge === 'top' ? '-1px 0px 0px 0px' : '0px 0px -1px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [edge]);
  return [ref, stuck] as const;
}

function StepRail({ index, failed, sticky }: { index: number; failed: boolean; sticky: boolean }) {
  const [ref, stuck] = useStuck<HTMLOListElement>('top');
  return (
    <ol
      ref={ref}
      className={cn(
        '-my-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-transparent py-2 text-sm max-sm:gap-x-2',
        sticky && 'sticky top-0 z-10 bg-surface',
        sticky && stuck && 'border-border',
      )}
      aria-label="Import steps"
    >
      {STEPS.map((label, i) => {
        const done = i < index;
        const current = i === index;
        const stopped = current && failed;
        return (
          <li key={label} className="flex items-center gap-3 max-sm:gap-2">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn('w-6 border-t max-sm:w-3', i <= index ? 'border-text-secondary' : 'border-border')}
              />
            ) : null}
            <span
              className={cn(
                'flex items-center gap-2',
                current ? 'font-medium' : 'text-text-secondary',
                current && (stopped ? 'text-danger-fg' : 'text-text'),
              )}
              aria-current={current ? 'step' : undefined}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-5 flex-none place-items-center rounded-full text-2xs font-semibold tabular',
                  done && 'text-text-secondary ring-1 ring-border-strong ring-inset',
                  current && (stopped ? 'bg-danger-fg text-surface' : 'bg-ink text-ink-fg'),
                  !done && !current && 'bg-inset text-text-secondary',
                )}
              >
                {done ? (
                  <Check className="size-3" strokeWidth={2.5} />
                ) : stopped ? (
                  <X className="size-3" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              {label}
              {done ? (
                <span className="sr-only"> (done)</span>
              ) : stopped ? (
                <span className="sr-only"> (stopped)</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PickStep({ error, onPick }: { error: string | null; onPick: (file: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert title="This file cannot be imported.">{error}</FormAlert> : null}
      <div
        onDragOver={event => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={event => {
          event.preventDefault();
          setOver(false);
          onPick(event.dataTransfer.files[0]);
        }}
        data-dropzone
        className={cn(
          'flex flex-col items-start gap-3 rounded-md border border-dashed px-5 py-6 transition-colors dark:border-border-strong',
          over && 'border-solid border-text-secondary bg-hover',
        )}
      >
        <span
          className={cn(
            'grid size-8 place-items-center rounded-md bg-inset text-text-secondary',
            over && 'bg-active text-text',
          )}
        >
          <FileSpreadsheet className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            {over ? (
              'Drop the file to upload it.'
            ) : (
              <>
                <span className="pointer-coarse:hidden">Choose a CSV file, or drop it here.</span>
                <span className="hidden pointer-coarse:inline">Choose a CSV file.</span>
              </>
            )}
          </p>
          <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
            Saved as UTF-8 with a header row; commas or semicolons. Up to {formatCount(CSV_IMPORT_MAX_ROWS)} rows and{' '}
            {formatBytes(CSV_IMPORT_MAX_BYTES)}. Nothing is created until you start the import.
          </p>
        </div>
        <Button size="sm" onClick={() => input.current?.click()}>
          Choose file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          tabIndex={-1}
          aria-hidden
          onChange={event => {
            onPick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

const PHASE: Record<UploadPhase, string> = {
  hashing: 'Preparing the file…',
  uploading: 'Uploading…',
  reading: 'Reading the columns…',
};

function UploadingStep({ step, onCancel }: { step: Extract<Step, { kind: 'uploading' }>; onCancel: () => void }) {
  const ratio = step.phase === 'reading' ? 1 : step.total > 0 ? step.loaded / step.total : 0;
  return (
    <div className="flex flex-col gap-3 rounded-md border px-5 py-4" role="status">
      <div className="flex items-center gap-3">
        <span className="grid size-8 flex-none place-items-center rounded-md bg-inset text-text-secondary">
          <FileSpreadsheet className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{step.file.name}</span>
          <span className="text-xs text-text-secondary tabular">
            {PHASE[step.phase]}{' '}
            {step.phase === 'uploading'
              ? `${formatBytes(step.loaded)} of ${formatBytes(step.total)}`
              : `· ${formatBytes(step.file.size)}`}
          </span>
        </div>
        {step.phase === 'reading' ? null : (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <Meter ratio={ratio} label="Upload" className="h-1.5" />
    </div>
  );
}

interface MapStepProps {
  project: string;
  projectName: string;
  preview: ImportPreview;
  onChecked: (checked: boolean) => void;
  onRestart: () => void;
  onStarted: (id: number) => void;
}

function MapStep({ project, projectName, preview, onChecked, onRestart, onStarted }: MapStepProps) {
  const fields = useCustomFields(project);
  const dryRun = useDryRunImport(project);
  const start = useStartImport(project);
  const [mapping, setMapping] = useState<Record<string, string>>(preview.suggested_mapping);
  const [result, setResult] = useState<{ for: string; run: ImportDryRun } | null>(null);

  const job = preview.job;
  const key = JSON.stringify(Object.entries(mapping).sort());
  const current = result?.for === key ? result.run : null;
  const titled = hasTitle(mapping);
  const busy = dryRun.isPending || start.isPending;
  const checked = current !== null;

  useEffect(() => onChecked(checked), [checked, onChecked]);

  const runDry = () => dryRun.mutate({ id: job.id, mapping }, { onSuccess: run => setResult({ for: key, run }) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{job.filename}</span>
        <span className="text-sm text-text-secondary tabular">
          {rows(job.total_rows ?? 0)} · {formatCount(job.headers?.length ?? 0)}{' '}
          {job.headers?.length === 1 ? 'column' : 'columns'} · {formatBytes(job.size_bytes)}
        </span>
        <TextButton className="text-sm" onClick={onRestart} disabled={busy}>
          Choose another file
        </TextButton>
      </div>

      <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
        Pick the field each column fills. Columns named like a field are matched already; a column left on{' '}
        <span className="text-text">Don’t import</span> is ignored.
      </p>

      <ColumnMapping
        headers={job.headers ?? []}
        sample={preview.sample}
        mapping={mapping}
        customFields={fields.data ?? []}
        fieldsLoading={fields.isPending}
        onChange={next => {
          setMapping(next);
          dryRun.reset();
          start.reset();
        }}
        disabled={busy}
      />

      {current ? <DryRunResult project={project} projectName={projectName} run={current} /> : null}

      <StepFooter>
        {dryRun.error ? (
          <FormAlert title="The dry run did not finish.">
            {dryRun.error.message} Your column choices are kept; run it again.
          </FormAlert>
        ) : null}
        {start.error ? <FormAlert title="The import did not start.">{start.error.message}</FormAlert> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {current ? (
            <PendingButton
              size="sm"
              disabled={busy || current.valid_rows === 0}
              onClick={() => start.mutate({ id: job.id, mapping }, { onSuccess: started => onStarted(started.id) })}
              pending={start.isPending}
              pendingLabel="Starting…"
            >
              {current.valid_rows === 0 ? 'Import' : `Import ${issues(current.valid_rows)}`}
            </PendingButton>
          ) : null}
          <PendingButton
            variant={current ? 'outline' : 'default'}
            size="sm"
            onClick={runDry}
            disabled={busy || !titled}
            pending={dryRun.isPending}
            pendingLabel="Checking…"
          >
            {current ? 'Dry run again' : 'Dry run'}
          </PendingButton>
          <span className="text-sm text-text-secondary">
            {!titled
              ? 'Choose the column that holds each issue’s title first.'
              : current
                ? null
                : 'Checks every row and creates nothing.'}
          </span>
        </div>
      </StepFooter>
    </div>
  );
}

/** The step's actions after a hairline; pinned to the viewport while the step is taller than it, with a fade over what scrolls under. */
function StepFooter({ children }: { children: ReactNode }) {
  const [ref, stuck] = useStuck<HTMLDivElement>('bottom');
  return (
    <div
      ref={ref}
      className={cn(
        'sticky bottom-0 z-10 mt-2 flex flex-col gap-3 border-t bg-surface py-4',
        "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-linear-to-t before:from-surface before:to-transparent before:opacity-0 before:transition-opacity before:content-['']",
        stuck && 'before:opacity-100',
      )}
    >
      {children}
    </div>
  );
}

function DryRunResult({ project, projectName, run }: { project: string; projectName: string; run: ImportDryRun }) {
  return (
    <section aria-label="Dry run" className="flex scroll-mt-14 flex-col gap-5 pt-2">
      <div className="flex flex-col gap-3">
        <Figures
          items={[
            { label: 'Rows', value: run.total_rows },
            { label: 'Will be created', value: run.valid_rows },
            { label: 'Will fail', value: run.failed_rows, tone: 'danger' },
          ]}
        />
        <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
          {run.failed_rows === 0
            ? 'Every row would become an issue.'
            : run.valid_rows === 0
              ? 'No row would become an issue, so there is nothing to import. Fix the file or the mapping, then run the dry run again.'
              : 'Rows that fail are skipped and listed again after the import; the rest are created.'}
        </p>
      </div>
      <UnknownValues project={project} projectName={projectName} run={run} />
      {run.errors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <GroupHeading>Rows that fail</GroupHeading>
          <ImportErrorsTable errors={run.errors} failed={run.failed_rows} accepted={run.unknown_values.length === 0} />
        </div>
      ) : null}
    </section>
  );
}

interface StartedStepProps {
  project: string;
  id: number;
  onFinished: (outcome: Outcome) => void;
  onAnother: () => void;
}

function StartedStep({ project, id, onFinished, onAnother }: StartedStepProps) {
  const job = useImport(project, id);
  const refresh = useRefreshAfterImport();
  const status = job.data?.status;

  useEffect(() => {
    const done = status === 'completed' || status === 'failed' ? status : null;
    onFinished(done);
    if (done) refresh();
    // Once per finished import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!job.data) {
    return job.isError ? (
      <LoadError onRetry={() => void job.refetch()} detail={errorDetail(job.error)}>
        The import’s progress could not be loaded.
      </LoadError>
    ) : (
      <p className="text-sm text-text-secondary" role="status">
        Starting…
      </p>
    );
  }

  const data = job.data;
  const another = (
    <Button variant="outline" size="sm" onClick={onAnother}>
      Import another file
    </Button>
  );
  const view = (
    <Button asChild size="sm">
      <Link href={`/projects/${project}/issues` as Route}>View imported issues</Link>
    </Button>
  );

  if (isImportRunning(data)) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="font-medium">
          Importing {data.filename}
          {data.status === 'queued' ? ' — waiting to start' : ''}
        </p>
        <ImportProgress job={data} />
        <p className="text-sm text-text-secondary">
          You can leave this page; the import carries on, and Recent imports below shows how far it got.
        </p>
      </div>
    );
  }

  const failed = data.status === 'failed';
  return (
    <div className="flex flex-col gap-4">
      {failed ? (
        <FormAlert title={`The import of ${data.filename} stopped.`}>{stoppedSummary(data)}</FormAlert>
      ) : (
        <div className="flex gap-2.5" role="status">
          <CheckCircle2 className="mt-[3px] size-icon-sm flex-none text-success-fg" aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-medium">
              Imported {issues(data.created_issues)} from {data.filename}.
            </p>
            <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
              {data.failed_rows > 0
                ? `${rows(data.failed_rows)} failed and were skipped. Fix them in the file and import just those rows.`
                : 'Every row became an issue.'}
            </p>
          </div>
        </div>
      )}
      <ResultFigures job={data} />
      {data.errors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <GroupHeading>Rows that failed</GroupHeading>
          <ImportErrorsTable errors={data.errors} failed={data.failed_rows} accepted />
        </div>
      ) : null}
      {/* The figures' own rule already ends the summary when no table follows it. */}
      <div className={cn('flex flex-wrap gap-2', data.errors.length > 0 && 'mt-2 border-t pt-4')}>
        {data.created_issues > 0 ? view : null}
        {another}
      </div>
    </div>
  );
}
