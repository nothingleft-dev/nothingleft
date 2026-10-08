import type { APIRoute } from 'astro';
import spec from '../../../../../docs/openapi.yaml?raw';

export const GET: APIRoute = () =>
  new Response(spec, {
    headers: { 'content-type': 'application/yaml; charset=utf-8' },
  });
