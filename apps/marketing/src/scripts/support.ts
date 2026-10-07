import { SUPPORT_EMAIL } from '@lib/site';
import {
  LIMITS,
  PRODUCT_AREAS,
  REQUEST_TYPES,
  SUPPORT_ENDPOINT,
  invalidField,
  type SupportErrorBody,
  type SupportField,
  type SupportRequest,
} from '@lib/support-contract';
import { initSegmented } from './segmented';

const SEND_TIMEOUT_MS = 20_000;

const MESSAGES: Record<SupportField, { missing?: string; invalid: string }> = {
  type: { invalid: 'Choose what the request is about.' },
  name: { invalid: `Keep the name to ${LIMITS.name} characters or fewer.` },
  email: {
    missing: 'Enter the email address we should reply to.',
    invalid: 'Enter an email address in the form name@example.com.',
  },
  subject: {
    missing: 'Add a short subject.',
    invalid: `Keep the subject to ${LIMITS.subject} characters or fewer.`,
  },
  message: {
    missing: 'Describe what you need.',
    invalid: `Keep the description to ${LIMITS.message.toLocaleString('en')} characters or fewer.`,
  },
  area: { invalid: 'Choose a product area from the list, or none.' },
};

const FIELD_ORDER: SupportField[] = ['type', 'name', 'email', 'subject', 'message', 'area'];

const VALID_SAMPLE: SupportRequest = {
  type: 'question',
  name: '',
  email: 'name@example.com',
  subject: 'Subject',
  message: 'Message',
  area: '',
  website: '',
  elapsed_ms: 0,
};

// The contract reports the first invalid field only; patching each one with a valid value
// in turn collects them all while the contract stays the one definition of "valid".
function invalidFields(input: SupportRequest): SupportField[] {
  const probe: SupportRequest = { ...input };
  const found: SupportField[] = [];
  for (let field = invalidField(probe); field; field = invalidField(probe)) {
    found.push(field);
    Object.assign(probe, { [field]: VALID_SAMPLE[field] });
  }
  return FIELD_ORDER.filter(field => found.includes(field));
}

function errorText(field: SupportField, input: SupportRequest): string {
  const message = MESSAGES[field];
  const value = input[field];
  return typeof value === 'string' && value === '' && message.missing ? message.missing : message.invalid;
}

function el<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`${selector} is missing from the support markup`);
  return found;
}

function initGuideFilter(): void {
  const root = document.querySelector<HTMLElement>('[data-guides]');
  if (!root) return;
  const input = el<HTMLInputElement>(root, '#guide-filter');
  const count = el(root, '[data-guide-count]');
  const empty = el(root, '[data-guide-empty]');
  const items = [...root.querySelectorAll<HTMLElement>('[data-guide]')];

  input.addEventListener('input', () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    items.forEach(item => {
      const terms = item.dataset.terms ?? '';
      const match = words.every(word => terms.includes(word));
      item.hidden = !match;
      if (match) shown += 1;
    });
    empty.hidden = shown > 0;
    count.textContent =
      words.length === 0
        ? `${items.length} guides`
        : shown === 0
          ? 'No guides match'
          : `${shown} of ${items.length} guides match`;
  });
}

function initSupportForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-support-form]');
  if (!form) return;
  const section = form.closest('section') ?? document;

  const typeGroup = el(form, '[data-field="type"]');
  const typeOptions = [...typeGroup.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const areaGroup = el(form, '[data-field="area"]');
  const areaOptions = [...areaGroup.querySelectorAll<HTMLButtonElement>('[aria-pressed]')];
  const nameInput = el<HTMLInputElement>(form, '#support-name');
  const emailInput = el<HTMLInputElement>(form, '#support-email');
  const subjectInput = el<HTMLInputElement>(form, '#support-subject');
  const messageInput = el<HTMLTextAreaElement>(form, '#support-message');
  const honeypot = el<HTMLInputElement>(form, '[data-honeypot]');
  const summary = el(form, '[data-error-summary]');
  const summaryTitle = el(form, '[data-error-title]');
  const summaryList = el(form, '[data-error-list]');
  const failure = el(form, '[data-send-failure]');
  const failureReason = el(form, '[data-failure-reason]');
  const failureMailto = el<HTMLAnchorElement>(form, '[data-failure-mailto]');
  const submit = el<HTMLButtonElement>(form, '[data-submit]');
  const submitLabel = el(form, '[data-submit-label]');
  const sendStatus = el(form, '[data-send-status]');
  const confirmation = el(section, '[data-confirmation]');
  const confirmEmail = el(section, '[data-confirm-email]');
  const sendAnother = el<HTMLButtonElement>(section, '[data-send-another]');
  const helpDefault = el(section, '[data-help-default]');
  const helpBlocks = [...section.querySelectorAll<HTMLElement>('[data-help]')];

  const controls: Record<SupportField, HTMLElement> = {
    type: typeGroup,
    name: nameInput,
    email: emailInput,
    subject: subjectInput,
    message: messageInput,
    area: areaGroup,
  };

  let type = '';
  let area = '';
  let startedAt = performance.now();
  let sending = false;
  const marked = new Set<SupportField>();

  const read = (): SupportRequest => ({
    type: type as SupportRequest['type'],
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
    subject: subjectInput.value.trim(),
    message: messageInput.value.trim(),
    area: area as SupportRequest['area'],
    website: honeypot.value,
    elapsed_ms: Math.round(performance.now() - startedAt),
  });

  const showHelp = () => {
    helpDefault.hidden = type !== '';
    helpBlocks.forEach(block => {
      block.hidden = block.dataset.help !== type;
    });
  };

  const focusField = (field: SupportField) => {
    if (field === 'type') {
      (typeOptions.find(option => option.tabIndex === 0) ?? typeOptions[0])?.focus();
    } else if (field === 'area') {
      areaOptions[0]?.focus();
    } else {
      controls[field].focus();
    }
  };

  const setFieldError = (field: SupportField, text: string | undefined) => {
    const control = controls[field];
    const error = el(form, `[data-error-for="${field}"]`);
    const base = control.dataset.describedby ?? control.getAttribute('aria-describedby') ?? '';
    control.dataset.describedby = base;
    error.textContent = text ?? '';
    error.hidden = !text;
    if (text) {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', `${error.id} ${base}`.trim());
      marked.add(field);
    } else {
      control.removeAttribute('aria-invalid');
      if (base) control.setAttribute('aria-describedby', base);
      else control.removeAttribute('aria-describedby');
      marked.delete(field);
    }
  };

  const renderSummary = (input: SupportRequest) => {
    summaryList.replaceChildren(
      ...FIELD_ORDER.filter(field => marked.has(field)).map(field => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'link font-normal';
        link.href = `#${controls[field].id}`;
        link.textContent = errorText(field, input);
        link.addEventListener('click', event => {
          event.preventDefault();
          focusField(field);
        });
        item.append(link);
        return item;
      }),
    );
    summaryTitle.textContent = marked.size === 1 ? 'Check this before sending:' : 'Check these before sending:';
    summary.hidden = marked.size === 0;
  };

  const showErrors = (fields: SupportField[], input: SupportRequest) => {
    FIELD_ORDER.forEach(field => setFieldError(field, fields.includes(field) ? errorText(field, input) : undefined));
    renderSummary(input);
    if (fields.length > 0) summary.focus();
  };

  const recheck = (field: SupportField) => {
    if (!marked.has(field)) return;
    const input = read();
    if (invalidFields(input).includes(field)) return;
    setFieldError(field, undefined);
    renderSummary(input);
  };

  const mailtoFor = (input: SupportRequest) => {
    const typeLabel = REQUEST_TYPES.find(option => option.id === input.type)?.label ?? '';
    const areaLabel = PRODUCT_AREAS.find(option => option.id === input.area)?.label;
    const lines = [
      `Request type: ${typeLabel}`,
      ...(areaLabel ? [`Product area: ${areaLabel}`] : []),
      '',
      input.message,
    ];
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  };

  const setSending = (on: boolean) => {
    sending = on;
    submit.disabled = on;
    form.setAttribute('aria-busy', String(on));
    submitLabel.textContent = on ? 'Sending…' : 'Send request';
    sendStatus.textContent = on ? 'Sending your request.' : '';
  };

  const showFailure = (input: SupportRequest, reason: string) => {
    failureReason.textContent = reason;
    failureMailto.href = mailtoFor(input);
    failure.hidden = false;
    failure.focus();
  };

  const showConfirmation = (input: SupportRequest) => {
    confirmEmail.textContent = input.email;
    form.hidden = true;
    confirmation.hidden = false;
    confirmation.focus();
  };

  const reset = () => {
    form.reset();
    type = '';
    area = '';
    typeOptions.forEach((option, index) => {
      option.setAttribute('aria-checked', 'false');
      option.tabIndex = index === 0 ? 0 : -1;
    });
    areaOptions.forEach(option => option.setAttribute('aria-pressed', 'false'));
    FIELD_ORDER.forEach(field => setFieldError(field, undefined));
    summary.hidden = true;
    failure.hidden = true;
    showHelp();
    startedAt = performance.now();
    confirmation.hidden = true;
    form.hidden = false;
    typeOptions[0]?.focus();
  };

  initSegmented(typeGroup, value => {
    type = value;
    showHelp();
    recheck('type');
  });

  areaOptions.forEach(option => {
    option.addEventListener('click', () => {
      const pressed = option.getAttribute('aria-pressed') !== 'true';
      areaOptions.forEach(other => other.setAttribute('aria-pressed', String(other === option && pressed)));
      area = pressed ? (option.dataset.value ?? '') : '';
      recheck('area');
    });
  });

  (['name', 'email', 'subject', 'message'] as const).forEach(field => {
    controls[field].addEventListener('input', () => recheck(field));
  });

  document.querySelectorAll<HTMLAnchorElement>('a[data-request-type]').forEach(link => {
    link.addEventListener('click', () => {
      if (form.hidden) return;
      typeOptions.find(option => option.dataset.value === link.dataset.requestType)?.click();
    });
  });

  sendAnother.addEventListener('click', reset);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    failure.hidden = true;
    const input = read();
    const fields = invalidFields(input);
    if (fields.length > 0) {
      showErrors(fields, input);
      return;
    }
    showErrors([], input);
    setSending(true);

    let outcome: 'sent' | 'failed' | SupportField = 'failed';
    let reason = 'The form could not reach us just now.';
    try {
      const response = await fetch(SUPPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (response.status === 201) {
        outcome = 'sent';
      } else {
        const body = (await response.json().catch(() => undefined)) as SupportErrorBody | undefined;
        if (body?.error.code === 'invalid_field' && body.error.field) outcome = body.error.field;
        else reason = 'Our side could not store it just now.';
      }
    } catch {
      reason = 'The form could not reach us. Check your connection.';
    }
    setSending(false);

    if (outcome === 'sent') showConfirmation(input);
    else if (outcome === 'failed') showFailure(input, reason);
    else showErrors([outcome], input);
  });

  showHelp();
}

initGuideFilter();
initSupportForm();
