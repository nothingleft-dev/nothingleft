'use client';

import { useMemo, useRef, useState } from 'react';
import { checkMarkdownSize } from '@nothingleft/markdown';
import type {
  Attachment,
  CreateIssue,
  CustomField,
  CustomFieldValueInput,
  Issue,
  IssueLinkName,
  IssueRef,
  TagRef,
} from '@nothingleft/types';
import { fieldsForType } from '@components/custom-fields/field-types';
import { useCustomFields } from '@hooks/use-custom-fields';
import { useSchemaValues } from '@hooks/use-project-schema';
import { useDiscardDrafts, useUploader } from '@hooks/use-attachments';
import { useApiError } from '@hooks/use-api-error';
import { useCreateIssue } from '@hooks/use-issues';
import { useProjects } from '@hooks/use-projects';

const LAST_PROJECT_KEY = 'nl:create-issue:last-project';

const readLastProject = () => {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
};

const writeLastProject = (key: string) => {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, key);
  } catch {
    // A blocked store only costs the preselection next time.
  }
};

export interface DraftFields {
  type?: string;
  priority?: string;
  status?: string;
  assignees: string[];
  estimate?: string;
  start_date?: string;
  due_date?: string;
  /** A sprint's slug. */
  sprint?: string;
  story_points?: number;
  /** By slug. Absent takes the field's default; null clears it even so. */
  custom: Record<string, CustomFieldValueInput>;
}

export const EMPTY_FIELDS: DraftFields = { assignees: [], custom: {} };

const isEmptyInput = (value: CustomFieldValueInput) =>
  value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0);

/** What a field will hold on the new issue: the value chosen, else its default. */
export const draftValueOf = (field: CustomField, fields: DraftFields): CustomFieldValueInput =>
  field.slug in fields.custom ? (fields.custom[field.slug] ?? null) : field.default_value;

/** A tag nobody has used yet is created with the issue, in the colour picked for it. */
export type DraftTag = TagRef & { isNew?: boolean };

/** A link made with the issue; the target is kept whole for its row. */
export interface DraftLink {
  link: IssueLinkName;
  issue: IssueRef;
}

export interface ParkedDraft {
  projectKey: string | null;
  title: string;
  description: string;
  fields: DraftFields;
  parent: string | null;
  tags: DraftTag[];
  links: DraftLink[];
  /** Drafts already uploaded from the dialog, still to be claimed by the issue. */
  files: Attachment[];
}

// Handed from the dialog to the full page across a client navigation; memory is enough.
let parked: ParkedDraft | null = null;

export const parkDraft = (draft: ParkedDraft) => {
  parked = draft;
};

export const takeParkedDraft = () => {
  const draft = parked;
  parked = null;
  return draft;
};

function groupLinks(links: readonly DraftLink[]): NonNullable<CreateIssue['links']> {
  const byName = new Map<string, string[]>();
  for (const { link, issue } of links) byName.set(link, [...(byName.get(link) ?? []), issue.key]);
  return [...byName].map(([link, issues]) => ({ link, issues }));
}

interface UseIssueDraftOptions {
  routeProject: string | null;
  initial?: ParkedDraft | null;
  parent?: string | null;
  onCreated: (issue: Issue) => void;
}

export function useIssueDraft({ routeProject, initial, parent: parentKey = null, onCreated }: UseIssueDraftOptions) {
  const projects = useProjects({ archived: 'false' });
  const writable = useMemo(
    () => (projects.data ?? []).filter(p => !p.is_archived && p.my_role !== 'observer'),
    [projects.data],
  );
  const [chosen, setChosen] = useState<string | null>(initial?.projectKey ?? null);
  const projectKey = useMemo(() => {
    const candidates = [chosen, routeProject, readLastProject()];
    return candidates.find(k => k && writable.some(p => p.key === k)) ?? writable[0]?.key ?? null;
  }, [chosen, routeProject, writable]);
  const project = writable.find(p => p.key === projectKey) ?? null;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [fields, setFields] = useState<DraftFields>(initial?.fields ?? EMPTY_FIELDS);
  const [showRequired, setShowRequired] = useState(false);
  const customFields = useCustomFields(projectKey);
  const types = useSchemaValues(projectKey, 'types');
  const typeName = fields.type ?? types.data?.find(t => t.is_default)?.name ?? null;
  const applicable = fieldsForType(customFields.data ?? [], typeName);
  // A checkbox is never required, so false never counts as missing for one.
  const requiredMissing = applicable.filter(f => f.is_required && isEmptyInput(draftValueOf(f, fields)));
  const custom = Object.fromEntries(
    applicable.filter(f => f.slug in fields.custom).map(f => [f.slug, fields.custom[f.slug] ?? null]),
  );
  const [parent, setParent] = useState<string | null>(initial?.parent ?? parentKey);
  const [tags, setTags] = useState<DraftTag[]>(initial?.tags ?? []);
  const [links, setLinks] = useState<DraftLink[]>(initial?.links ?? []);
  const [carried, setCarried] = useState<Attachment[]>(initial?.files ?? []);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const uploader = useUploader(projectKey ? { project: projectKey } : null);
  const discardCarried = useDiscardDrafts();
  const files = [...carried, ...uploader.ready.map(u => u.attachment!)];
  const attachmentIds = files.filter(f => description.includes(f.url)).map(f => f.id);

  const create = useCreateIssue();
  const error = useApiError(create.error);
  const size = checkMarkdownSize(description);

  const body: CreateIssue | null = projectKey
    ? {
        project: projectKey,
        title: title.trim(),
        ...(description.trim() ? { description_md: description } : {}),
        ...(fields.type ? { type: fields.type } : {}),
        ...(fields.priority ? { priority: fields.priority } : {}),
        ...(fields.status ? { status: fields.status } : {}),
        ...(fields.assignees.length ? { assignees: fields.assignees } : {}),
        ...(fields.estimate && project?.time_tracking_enabled !== false ? { estimate: fields.estimate } : {}),
        ...(fields.start_date ? { start_date: fields.start_date } : {}),
        ...(fields.due_date ? { due_date: fields.due_date } : {}),
        ...(fields.sprint ? { sprint: fields.sprint } : {}),
        ...(fields.story_points !== undefined ? { story_points: fields.story_points } : {}),
        ...(parent ? { parent } : {}),
        ...(Object.keys(custom).length ? { custom_fields: custom } : {}),
        ...(tags.length ? { tags: tags.map(t => (t.isNew ? { name: t.name, color: t.color } : t.slug)) } : {}),
        ...(links.length ? { links: groupLinks(links) } : {}),
        ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
      }
    : null;

  const canSubmit =
    body !== null && title.trim() !== '' && !create.isPending && size.level !== 'too_large' && !uploader.busy;

  // The same body retried keeps its key, so a dropped response cannot file the issue twice.
  const idempotencyKeyFor = (serialized: string) => {
    if (attempt.current?.body !== serialized) attempt.current = { body: serialized, key: crypto.randomUUID() };
    return attempt.current.key;
  };

  const submit = () => {
    if (!body || !canSubmit) return;
    if (requiredMissing.length > 0) return setShowRequired(true);
    const serialized = JSON.stringify(body);
    create.mutate(
      { body, idempotencyKey: idempotencyKeyFor(serialized) },
      {
        onSuccess: issue => {
          attempt.current = null;
          uploader.finish(description);
          discardCarried(carried.filter(f => !description.includes(f.url)));
          setCarried([]);
          writeLastProject(issue.project.key);
          setTitle('');
          setDescription('');
          setTags([]);
          setLinks([]);
          setShowRequired(false);
          onCreated(issue);
        },
      },
    );
  };

  const selectProject = (key: string) => {
    setChosen(key);
    setFields(EMPTY_FIELDS);
    // A parent is always in the issue's own project.
    if (parent && !parent.startsWith(`${key}-`)) setParent(null);
  };

  return {
    writable,
    noWritableProject: projects.isSuccess && writable.length === 0,
    project,
    selectProject,
    title,
    setTitle,
    description,
    setDescription,
    fields,
    setFields,
    parent,
    setParent,
    tags,
    setTags,
    links,
    setLinks,
    size,
    uploader,
    applicableFields: applicable,
    requiredMissing: showRequired ? requiredMissing : [],
    error,
    pending: create.isPending,
    canSubmit,
    submit,
    park: (): ParkedDraft => ({ projectKey, title, description, fields, parent, tags, links, files }),
  };
}

export type IssueDraft = ReturnType<typeof useIssueDraft>;
