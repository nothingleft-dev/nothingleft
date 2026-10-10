'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { FileSpreadsheet } from 'lucide-react';
import { formatBytes } from '@nothingleft/format';
import { CSV_IMPORT_MAX_BYTES, CSV_IMPORT_MAX_ROWS, type ImportDryRun, type ImportPreview } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Meter } from '@components/dashboard/meter';
import { FormAlert } from '@components/auth/form-alert';
import { ColumnMapping, hasTitle } from '@components/imports/column-mapping';
import {
  Figures,
  ImportErrorsTable,
  ImportProgress,
  UnknownValues,
  issues,
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

type Step =
  | { kind: 'pick' }
  | { kind: 'uploading'; file: File; phase: UploadPhase; loaded: number; total: number }
  | { kind: 'map'; preview: ImportPreview }
  | { kind: 'started'; id: number };

const STEPS = ['File', 'Columns', 'Dry run', 'Import'] as const;

interface CsvImportFlowProps {
  project: string;
  /** An upload left unstarted, picked up again from the recent list. */
  resumeId: number | null;
  onDone: () => void;
}

export function CsvImportFlow({ project, resumeId, onDone }: CsvImportFlowProps) {
  const [step, setStep] = useState<Step>({ kind: 'pick' });
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

  const index = step.kind === 'pick' || step.kind === 'uploading' ? 0 : step.kind === 'map' ? 1 : 3;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Import steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-text-muted" aria-hidden>
                ›
              </span>
            ) : null}
            <span
              aria-current={i === index ? 'step' : undefined}
              className={cn(i === index ? 'font-medium text-text' : 'text-text-secondary')}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

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
          preview={step.preview}
          onRestart={() => setStep({ kind: 'pick' })}
          onStarted={id => setStep({ kind: 'started', id })}
        />
      ) : null}

      {step.kind === 'started' ? (
        <StartedStep
          project={project}
          id={step.id}
          onAnother={() => {
            setStep({ kind: 'pick' });
            onDone();
          }}
        />
      ) : null}
    </div>
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
        className={cn(
          'flex flex-col items-start gap-3 rounded-md border border-dashed px-5 py-6',
          over && 'border-border-strong bg-hover',
        )}
      >
        <span className="grid size-8 place-items-center rounded-md bg-inset text-text-secondary">
          <FileSpreadsheet className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">Choose a CSV file, or drop it here.</p>
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
    <div className="flex max-w-2xl flex-col gap-2 rounded-md border px-4 py-3" role="status">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="size-icon text-text-secondary" />
        <span className="min-w-0 flex-1 truncate font-medium">{step.file.name}</span>
        <span className="font-mono text-xs tabular text-text-secondary">{formatBytes(step.file.size)}</span>
      </div>
      <Meter ratio={ratio} label="Upload" className="h-1.5" />
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{PHASE[step.phase]}</span>
        {step.phase === 'reading' ? null : (
          <Button variant="ghost" size="xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

interface MapStepProps {
  project: string;
  preview: ImportPreview;
  onRestart: () => void;
  onStarted: (id: number) => void;
}

function MapStep({ project, preview, onRestart, onStarted }: MapStepProps) {
  const fields = useCustomFields(project);
  const dryRun = useDryRunImport(project);
  const start = useStartImport(project);
  const [mapping, setMapping] = useState<Record<string, string>>(preview.suggested_mapping);
  const [result, setResult] = useState<{ for: string; run: ImportDryRun } | null>(null);
  const [triedWithoutTitle, setTriedWithoutTitle] = useState(false);

  const job = preview.job;
  const key = JSON.stringify(Object.entries(mapping).sort());
  const current = result?.for === key ? result.run : null;
  const titled = hasTitle(mapping);
  const busy = dryRun.isPending || start.isPending;

  const runDry = () => {
    if (!titled) return setTriedWithoutTitle(true);
    dryRun.mutate({ id: job.id, mapping }, { onSuccess: run => setResult({ for: key, run }) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{job.filename}</span>
        <span className="text-sm text-text-secondary tabular">
          {rows(job.total_rows ?? 0)} · {formatBytes(job.size_bytes)}
        </span>
        <Button variant="link" className="h-auto p-0 text-sm" onClick={onRestart} disabled={busy}>
          Choose another file
        </Button>
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

      {!titled && triedWithoutTitle ? <FormAlert title="Choose the column that holds each issue's title." /> : null}
      {dryRun.error ? <FormAlert title="The dry run did not finish.">{dryRun.error.message}</FormAlert> : null}
      {start.error ? <FormAlert title="The import did not start.">{start.error.message}</FormAlert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={current ? 'outline' : 'default'} size="sm" onClick={runDry} disabled={busy}>
          {dryRun.isPending ? 'Checking every row…' : current ? 'Dry run again' : 'Dry run'}
        </Button>
        {current ? (
          <Button
            size="sm"
            disabled={busy || current.valid_rows === 0}
            onClick={() => start.mutate({ id: job.id, mapping }, { onSuccess: started => onStarted(started.id) })}
          >
            {start.isPending ? 'Starting…' : `Import ${issues(current.valid_rows)}`}
          </Button>
        ) : (
          <span className="text-sm text-text-secondary">Checks every row and creates nothing.</span>
        )}
      </div>

      {current ? <DryRunResult project={project} run={current} /> : null}
    </div>
  );
}

function DryRunResult({ project, run }: { project: string; run: ImportDryRun }) {
  return (
    <section aria-label="Dry run" className="flex flex-col gap-4">
      <Figures
        items={[
          { label: 'Rows', value: run.total_rows },
          { label: 'Become issues', value: run.valid_rows },
          { label: 'Fail', value: run.failed_rows, tone: 'danger' },
        ]}
      />
      {run.failed_rows === 0 ? (
        <p className="text-sm text-text-secondary">Every row would become an issue.</p>
      ) : run.valid_rows === 0 ? (
        <p className="text-sm text-text-secondary">No row would become an issue. Fix the file or the mapping first.</p>
      ) : (
        <p className="text-sm text-text-secondary">
          Rows that fail are skipped and listed again after the import; the rest are created.
        </p>
      )}
      <UnknownValues project={project} values={run.unknown_values} />
      <ImportErrorsTable errors={run.errors} failed={run.failed_rows} />
    </section>
  );
}

function StartedStep({ project, id, onAnother }: { project: string; id: number; onAnother: () => void }) {
  const job = useImport(project, id);
  const refresh = useRefreshAfterImport();
  const status = job.data?.status;

  useEffect(() => {
    if (status === 'completed' || status === 'failed') refresh();
    // Once per finished import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!job.data) {
    return job.isError ? (
      <FormAlert title="The import's progress could not be loaded.">
        <button type="button" onClick={() => void job.refetch()}>
          Try again
        </button>
      </FormAlert>
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
    return (
      <div className="flex flex-col gap-3">
        <FormAlert title={`The import of ${data.filename} stopped.`}>
          {data.error?.message ?? 'Rows already imported are kept.'}{' '}
          {data.created_issues > 0 ? `${issues(data.created_issues)} were created before it stopped.` : null}
        </FormAlert>
        <div>{another}</div>
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
        <Button asChild size="sm">
          <Link href={`/projects/${project}/issues` as Route}>Open the issues</Link>
        </Button>
        {another}
      </div>
      <ImportErrorsTable errors={data.errors} failed={data.failed_rows} />
    </div>
  );
}
