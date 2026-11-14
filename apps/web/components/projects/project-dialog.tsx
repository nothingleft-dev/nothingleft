'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CreateProjectSchema, type PaletteHue } from '@nothingleft/types';
import { generateProjectKey } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PaletteSwatches } from '@components/palette-swatches';
import { useApiError } from '@hooks/use-api-error';
import { useCreateProject } from '@hooks/use-projects';
import { PendingButton } from '@components/pending-button';
import { useFieldProblems } from '@hooks/use-field-problems';

export function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<PaletteHue>('blue');
  const create = useCreateProject();
  const error = useApiError(create.error, ['name', 'key']);
  const local = useFieldProblems(CreateProjectSchema, { name: 'Name' });

  const derived = keyEdited ? key : (generateProjectKey(name) ?? '');
  const suggestion = error.code === 'project.key_taken' ? error.validValues[0] : undefined;

  const close = () => {
    onOpenChange(false);
    setName('');
    setKey('');
    setKeyEdited(false);
    local.clear('name');
    create.reset();
  };

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            The key becomes the prefix on every issue in it, so short reads better: PP-14 rather than PARTNER-14.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-project"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault();
            if (!local.check({ name })) return;
            create.mutate(
              { name: name.trim(), avatar_color: color, ...(derived ? { key: derived } : {}) },
              {
                onSuccess: project => {
                  toast.success(`${project.name} created.`);
                  close();
                },
              },
            );
          }}
        >
          {error.summary ? <FormAlert title={error.summary} /> : null}

          <Field
            label="Name"
            autoFocus
            placeholder="Partner Portal"
            value={name}
            error={local.problems['name'] ?? error.fields['name']}
            onChange={e => {
              setName(e.target.value);
              local.clear('name');
            }}
          />

          <Field
            label="Key"
            className="font-mono tabular uppercase"
            placeholder="PP"
            value={derived}
            error={error.fields['key']}
            errorAction={
              suggestion ? (
                <button
                  type="button"
                  className="action-link font-medium"
                  onClick={() => {
                    setKeyEdited(true);
                    setKey(suggestion);
                    create.reset();
                  }}
                >
                  Use {suggestion} instead
                </button>
              ) : null
            }
            onChange={e => {
              setKeyEdited(true);
              setKey(e.target.value.toUpperCase());
            }}
          />

          <PaletteSwatches value={color} onChange={setColor} />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <PendingButton
            type="submit"
            form="create-project"
            disabled={name.trim() === ''}
            pending={create.isPending}
            pendingLabel="Creating…"
          >
            Create project
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
