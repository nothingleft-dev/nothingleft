interface ScalarGlobal {
  createApiReference: (target: Element, config: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    Scalar?: ScalarGlobal;
  }
}

function mount(): void {
  const target = document.querySelector<HTMLElement>('[data-api-reference]');
  const url = target?.dataset.apiReference;
  if (!target || !url || !window.Scalar) return;
  // Scalar hydrates whatever the mount holds, and the static fallback would not match.
  target.replaceChildren();
  window.Scalar.createApiReference(target, {
    url,
    servers: [{ url: 'https://api.nothingleft.dev' }],
    forceDarkModeState: 'light',
    hideDarkModeToggle: true,
    hideTestRequestButton: true,
    hideClientButton: true,
    documentDownloadType: 'none',
    showDeveloperTools: 'never',
    defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
    withDefaultFonts: false,
    telemetry: false,
    agent: { disabled: true },
    mcp: { disabled: true },
  });
}

const loader = document.querySelector<HTMLScriptElement>('script[data-scalar]');
if (window.Scalar) mount();
else loader?.addEventListener('load', mount, { once: true });

export {};
