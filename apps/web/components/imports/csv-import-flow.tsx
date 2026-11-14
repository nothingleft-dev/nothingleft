'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Check, FileSpreadsheet } from 'lucide-react';
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
  UnknownValues,
  issues,
  notReached,
  rows,
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

type StepState = 'done' | 'current' | 'upcoming';

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
  const [finished, setFinished] = useState(false);
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
      <StepRail index={stepIndex(step, checked, finished)} />

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
          onFinished={setFinished}
          onAnother={() => {
            setStep({ kind: 'pick' });
            onDone();
          }}
        />
      ) : null}
    </div>
  );
}

function stepIndex(step: Step, checked: boolean, finished: boolean) {
  if (step.kind === 'pick' || step.kind === 'uploading') return 0;
  if (step.kind === 'map') return checked ? 2 : 1;
  return finished ? STEPS.length : 3;
}

function StepRail({ index }: { index: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm max-sm:gap-x-2" aria-label="Import steps">
      {STEPS.map((label, i) => {
        const state: StepState = i < index ? 'done' : i === index ? 'current' : 'upcoming';
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
                'flex items-center gap-1.5',
                state === 'current' ? 'font-medium text-text' : 'text-text-secondary',
              )}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span aria-hidden className="grid w-3.5 place-items-center tabular">
                {state === 'done' ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              {label}
              {state === 'done' ? <span className="sr-only">, done</span> : null}
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
          'flex flex-col items-start gap-3 rounded-md border border-dashed px-5 py-6 transition-colors',
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
          <p className="text-sm text-text-secondary">
            Saved as UTF-8 with a header row; commas or semicolons. Up to {formatCount(CSV_IMPORT_MAX_ROWS)} rows and{' '}
            {formatBytes(CSV_IMPORT_MAX_BYTES)}. Nothing is created until you start the import.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
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
            {PHASE[step.phase]}
            {step.phase === 'uploading' ? ` ${Math.round(ratio * 100)}%` : null} · {formatBytes(step.file.size)}
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
          {rows(job.total_rows ?? 0)} · {formatBytes(job.size_bytes)}
        </span>
        <TextButton className="text-sm" onClick={onRestart} disabled={busy}>
          Choose another file
        </TextButton>
      </div>

      <p className="text-sm text-text-secondary">
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

      <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-surface py-3">
        {dryRun.error ? <FormAlert title="The dry run did not finish.">{dryRun.error.message}</FormAlert> : null}
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
            pendingLabel="Checking rows…"
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
      </div>
    </div>
  );
}

function DryRunResult({ project, projectName, run }: { project: string; projectName: string; run: ImportDryRun }) {
  return (
    <section aria-label="Dry run" className="flex flex-col gap-5 pt-2">
      <div className="flex flex-col gap-3">
        <Figures
          items={[
            { label: 'Rows', value: run.total_rows },
            { label: 'Will be created', value: run.valid_rows },
            { label: 'Will fail', value: run.failed_rows, tone: 'danger' },
          ]}
        />
        <p className="text-sm text-text-secondary">
          {run.failed_rows === 0
            ? 'Every row would become an issue.'
            : run.valid_rows === 0
              ? 'No row would become an issue, so there is nothing to import. Fix the file or the mapping, then run the dry run again.'
              : 'Rows that fail are skipped and listed again after the import; the rest are created.'}
        </p>
      </div>
      <UnknownValues project={project} projectName={projectName} values={run.unknown_values} />
      {run.errors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <GroupHeading>Rows that fail</GroupHeading>
          <ImportErrorsTable errors={run.errors} failed={run.failed_rows} />
        </div>
      ) : null}
    </section>
  );
}

interface StartedStepProps {
  project: string;
  id: number;
  onFinished: (finished: boolean) => void;
  onAnother: () => void;
}

function StartedStep({ project, id, onFinished, onAnother }: StartedStepProps) {
  const job = useImport(project, id);
  const refresh = useRefreshAfterImport();
  const status = job.data?.status;

  useEffect(() => {
    const done = status === 'completed' || status === 'failed';
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

  if (data.status === 'failed') {
    const missed = notReached(data);
    return (
      <div className="flex flex-col gap-4">
        <FormAlert title={`The import of ${data.filename} stopped.`}>
          {data.error?.message ?? 'Rows already imported are kept.'}
        </FormAlert>
        <Figures
          items={[
            { label: 'Created', value: data.created_issues },
            { label: 'Failed', value: data.failed_rows, tone: 'danger' },
            { label: 'Not reached', value: missed },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {data.created_issues > 0 ? view : null}
          {another}
        </div>
        {data.errors.length > 0 ? (
          <div className="flex flex-col gap-2">
            <GroupHeading>Rows that failed</GroupHeading>
            <ImportErrorsTable errors={data.errors} failed={data.failed_rows} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone="success" title={`Imported ${issues(data.created_issues)} from ${data.filename}.`}>
        {data.failed_rows > 0
          ? `${rows(data.failed_rows)} failed and were skipped. Fix them in the file and import just those rows.`
          : 'Every row became an issue.'}
      </FormAlert>
      <div className="flex flex-wrap gap-2">
        {view}
        {another}
      </div>
      {data.errors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <GroupHeading>Rows that failed</GroupHeading>
          <ImportErrorsTable errors={data.errors} failed={data.failed_rows} />
        </div>
      ) : null}
    </div>
  );
}
