"""Verify environment isolation, secret handling and safe Vercel synchronization."""
import contextlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from env_contract import (API_DEFAULTS, API_REQUIRED, API_SENSITIVE, MARKETING_WORKER_SECRETS, UI_KEYS, collect,
                          parse_env, systemd_env, write_private)
from test_release import load


class EnvironmentContract(unittest.TestCase):
    def api(self):
        return {**API_DEFAULTS, **{key: 'fake-value' for key in API_REQUIRED}}

    def test_mapping_and_service_isolation(self):
        values = self.api()
        secrets = {'API_' + key: value for key, value in values.items() if key in API_SENSITIVE}
        variables = {'API_' + key: value for key, value in values.items() if key not in API_SENSITIVE}
        variables.update(UI_NEXT_PUBLIC_API_BASE_URL='https://example.invalid', API_PORT='9999', API_OCI_DEPLOY_HOST='192.0.2.1')
        payload = collect('API', variables, secrets)
        self.assertEqual(payload['values'], values)
        self.assertNotIn('PORT', payload['values'])
        ui = collect('UI', variables, secrets)
        self.assertEqual(ui['values']['NEXT_PUBLIC_API_BASE_URL'], 'https://example.invalid')
        self.assertNotIn('DATABASE_URL', ui['values'])

    def test_ui_reuses_the_marketing_ga_id(self):
        variables = {'UI_NEXT_PUBLIC_API_BASE_URL': 'https://example.invalid', 'MARKETING_PUBLIC_GA_MEASUREMENT_ID': 'G-TEST'}
        self.assertEqual(collect('UI', variables, {})['values']['NEXT_PUBLIC_GA_MEASUREMENT_ID'], 'G-TEST')
        self.assertNotIn('NEXT_PUBLIC_GA_MEASUREMENT_ID', collect('UI', {'UI_NEXT_PUBLIC_API_BASE_URL': 'x'}, {})['values'])
        for variables, secrets in (({**variables, 'UI_NEXT_PUBLIC_GA_MEASUREMENT_ID': 'G-OTHER'}, {}),
                                   ({'UI_NEXT_PUBLIC_API_BASE_URL': 'x'}, {'MARKETING_PUBLIC_GA_MEASUREMENT_ID': 'do-not-log'}),
                                   ({'UI_NEXT_PUBLIC_API_BASE_URL': 'x', 'MARKETING_PUBLIC_GA_MEASUREMENT_ID': 'G\n'}, {})):
            with self.subTest(variables=list(variables)), self.assertRaises(ValueError) as caught:
                collect('UI', variables, secrets)
            self.assertNotIn('do-not-log', str(caught.exception))

    def test_rejects_unsafe_sources_without_leaking_values(self):
        cases = [({'API_DATABASE_URL': 'do-not-log'}, {}),
                 ({}, {'UI_NEXT_PUBLIC_API_BASE_URL': 'do-not-log'}),
                 ({'UI_NEXT_PUBLIC_API_BASE_URL': 'do-not-log\n'}, {}),
                 ({'UI_UNKNOWN': 'do-not-log'}, {}),
                 ({'UI_NEXT_PUBLIC_API_BASE_URL': 'one'}, {'UI_NEXT_PUBLIC_API_BASE_URL': 'do-not-log'})]
        for variables, secrets in cases:
            with self.subTest(variables=list(variables)), self.assertRaises(ValueError) as caught:
                collect('API' if 'API_DATABASE_URL' in variables else 'UI', variables, secrets)
            self.assertNotIn('do-not-log', str(caught.exception))

    def test_env_encoding_and_permissions(self):
        values = {'EMAIL_FROM': 'Name "Quoted" <test@example.invalid>', 'TOKEN': r'$literal\backslash'}
        self.assertEqual(parse_env(systemd_env(values)), values)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'private' / 'env.json'
            write_private(path, values)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)

    def test_renderer_never_prints_secret(self):
        with tempfile.TemporaryDirectory() as folder:
            values = self.api()
            variables = {'API_' + key: value for key, value in values.items() if key not in API_SENSITIVE}
            secrets = {'API_' + key: 'UNIQUE-SECRET-NOT-FOR-LOGS' for key in values if key in API_SENSITIVE}
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('render-deploy-env.py')),
                                     'API', folder + '/env.json'], capture_output=True, text=True,
                                    env={**os.environ, 'DEPLOY_VARS_JSON': json.dumps(variables),
                                         **{'DEPLOY_SECRET_' + name: value for name, value in secrets.items()}})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('UNIQUE-SECRET', result.stdout + result.stderr)
            self.assertEqual(json.loads(Path(folder + '/env.json').read_text())['DATABASE_URL'],
                             'UNIQUE-SECRET-NOT-FOR-LOGS')


class DeployWorkflows(unittest.TestCase):
    WORKFLOWS = Path(__file__).resolve().parents[2] / '.github' / 'workflows'

    def test_secrets_are_named_not_serialized(self):
        for path in self.WORKFLOWS.glob('*.yml'):
            with self.subTest(workflow=path.name):
                self.assertNotRegex(path.read_text().replace(' ', '').lower(), r'tojson\(secrets\)')

    def test_each_workflow_passes_every_sensitive_key_of_its_service(self):
        expected = {'deploy-oci.yml': {'API_' + key for key in API_SENSITIVE},
                    'deploy-marketing.yml': {'MARKETING_' + key for key in MARKETING_WORKER_SECRETS},
                    'deploy-vercel.yml': set()}
        for name, keys in expected.items():
            text = (self.WORKFLOWS / name).read_text()
            passed = set(re.findall(r'DEPLOY_SECRET_(\w+): \$\{\{ secrets\.(\w+) \}\}', text))
            with self.subTest(workflow=name):
                self.assertTrue(all(left == right for left, right in passed))
                self.assertEqual({left for left, _ in passed}, keys)
        self.assertTrue(all(key.startswith('NEXT_PUBLIC_') for key in UI_KEYS), 'a server-only UI key needs a named secret')

class VercelConfiguration(unittest.TestCase):
    def test_sync_upserts_and_removes_only_owned_production_keys(self):
        module = load('vercel-deploy')
        client = module.Vercel('hidden-token', 'project', 'team')
        existing = [{'id': 'old', 'key': 'NEXT_PUBLIC_GA_MEASUREMENT_ID', 'target': ['production'], 'comment': module.MARKER},
                    {'id': 'external', 'key': 'UNRELATED', 'target': ['production']},
                    {'id': 'preview', 'key': 'NEXT_PUBLIC_GA_MEASUREMENT_ID', 'target': ['preview'], 'comment': module.MARKER}]
        calls = []
        def request(method, path, body=None, **query):
            calls.append((method, path, body, query))
            if path.endswith('/env') and method == 'GET':
                return {'envs': existing}
            if method == 'GET':
                return {'rootDirectory': 'apps/web', 'framework': 'nextjs'}
            return {}
        with patch.object(client, 'request', side_effect=request), contextlib.redirect_stdout(io.StringIO()) as output:
            client.sync({'values': {'NEXT_PUBLIC_API_BASE_URL': 'https://example.invalid'}, 'secret_names': []})
        post = next(call for call in calls if call[0] == 'POST')
        self.assertEqual(post[2][0]['key'], 'NEXT_PUBLIC_API_BASE_URL')
        self.assertEqual(post[2][0]['target'], ['production'])
        self.assertEqual(post[2][0]['type'], 'plain')
        self.assertEqual([call[1] for call in calls if call[0] == 'DELETE'], ['/v9/projects/project/env/old'])
        self.assertNotIn('https://example.invalid', output.getvalue())

    def test_shared_preview_keys_fail_before_mutation(self):
        module = load('vercel-deploy')
        client = module.Vercel('hidden-token', 'project', 'team')
        with patch.object(client, 'request', side_effect=[{'rootDirectory': 'apps/web', 'framework': 'nextjs'},
                {'envs': [{'key': 'NEXT_PUBLIC_API_BASE_URL', 'target': ['production', 'preview']}]}]) as request:
            with self.assertRaises(ValueError):
                client.sync({'values': {'NEXT_PUBLIC_API_BASE_URL': 'https://example.invalid'}, 'secret_names': []})
            self.assertTrue(all(call.args[0] == 'GET' for call in request.call_args_list))

    def test_partial_upsert_failure_aborts_before_deleting_keys(self):
        module = load('vercel-deploy')
        client = module.Vercel('hidden-token', 'project', 'team')
        with patch.object(client, 'request', side_effect=[
                {'rootDirectory': 'apps/web', 'framework': 'nextjs'}, {'envs': []},
                {'failed': [{'error': {'value': 'secret-error-content'}}]}]) as request:
            with self.assertRaises(RuntimeError) as caught:
                client.sync({'values': {'NEXT_PUBLIC_API_BASE_URL': 'https://example.invalid'}, 'secret_names': []})
            self.assertNotIn('secret-error-content', str(caught.exception))
            self.assertEqual(len(request.call_args_list), 3)

    def test_http_body_and_cli_output_do_not_reach_logs(self):
        module = load('vercel-deploy')
        error = module.urllib.error.HTTPError('https://api.vercel.com', 400, 'secret-body', {}, io.BytesIO(b'secret-body'))
        with patch.object(module.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(RuntimeError) as caught:
                module.Vercel('hidden-token', 'project', 'team').request('GET', '/v9/projects/project')
            self.assertNotIn('secret-body', str(caught.exception))
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, VERCEL_ORG_ID='team', VERCEL_PROJECT_ID='project'), \
                patch.object(module.subprocess, 'run', return_value=type('Result', (), {'returncode': 0})()) as run:
            module.deploy(Path(folder), 'vercel')
            self.assertNotIn('--token', run.call_args.args[0])
            self.assertEqual(run.call_args.kwargs['stdout'].name, os.devnull)
            self.assertEqual(run.call_args.kwargs['stderr'].name, os.devnull)


class MarketingConfiguration(unittest.TestCase):
    def test_build_values_are_variables_and_worker_values_are_secrets(self):
        variables = {'MARKETING_PUBLIC_GA_MEASUREMENT_ID': 'G-TEST', 'MARKETING_CLOUDFLARE_ACCOUNT_ID': 'account',
                     'UI_NEXT_PUBLIC_API_BASE_URL': 'https://example.invalid'}
        secrets = {'MARKETING_TURSO_AUTH_TOKEN': 'token', 'MARKETING_CLOUDFLARE_API_TOKEN': 'cf-token'}
        payload = collect('MARKETING', variables, secrets)
        self.assertEqual(payload['values'], {'PUBLIC_GA_MEASUREMENT_ID': 'G-TEST', 'TURSO_AUTH_TOKEN': 'token'})
        self.assertEqual(payload['secret_names'], ['TURSO_AUTH_TOKEN'])
        for variables, secrets in (({}, {'MARKETING_PUBLIC_GA_MEASUREMENT_ID': 'do-not-log'}),
                                   ({'MARKETING_TURSO_AUTH_TOKEN': 'do-not-log'}, {}),
                                   ({'MARKETING_UNKNOWN': 'do-not-log'}, {})):
            with self.subTest(variables=list(variables), secrets=list(secrets)), self.assertRaises(ValueError) as caught:
                collect('MARKETING', variables, secrets)
            self.assertNotIn('do-not-log', str(caught.exception))

    def test_worker_name_comes_from_wrangler_config(self):
        module = load('cloudflare-deploy')
        self.assertEqual(module.worker_name((module.APP / 'wrangler.jsonc').read_text()), 'nothingleft-marketing')

    def test_build_never_receives_cloudflare_credentials(self):
        module = load('cloudflare-deploy')
        payload = {'values': {'PUBLIC_GA_MEASUREMENT_ID': 'G-TEST', 'TURSO_AUTH_TOKEN': 'token'},
                   'secret_names': ['TURSO_AUTH_TOKEN']}
        with patch.dict(os.environ, CLOUDFLARE_API_TOKEN='hidden'), contextlib.redirect_stdout(io.StringIO()), \
                patch.object(module.subprocess, 'run', return_value=type('Result', (), {'returncode': 0})()) as run:
            module.build(payload)
        environment = run.call_args.kwargs['env']
        self.assertNotIn('CLOUDFLARE_API_TOKEN', environment)
        self.assertNotIn('TURSO_AUTH_TOKEN', environment)
        self.assertEqual(environment['PUBLIC_GA_MEASUREMENT_ID'], 'G-TEST')

    def test_secret_sync_removes_only_owned_secrets(self):
        module = load('cloudflare-deploy')
        client = module.Cloudflare('hidden-token', 'account', 'worker')
        calls = []
        def request(method, path='', body=None):
            calls.append((method, path, body))
            return [{'name': 'TURSO_DATABASE_URL'}, {'name': 'UNRELATED'}] if method == 'GET' else None
        with patch.object(client, 'request', side_effect=request), contextlib.redirect_stdout(io.StringIO()) as output:
            client.sync({'TURSO_AUTH_TOKEN': 'secret-value'})
        self.assertEqual([call[2]['name'] for call in calls if call[0] == 'PUT'], ['TURSO_AUTH_TOKEN'])
        self.assertEqual([call[1] for call in calls if call[0] == 'DELETE'], ['/TURSO_DATABASE_URL'])
        self.assertNotIn('secret-value', output.getvalue())

    def test_http_body_does_not_reach_logs(self):
        module = load('cloudflare-deploy')
        error = module.urllib.error.HTTPError('https://api.cloudflare.com', 400, 'secret-body', {}, io.BytesIO(b'secret-body'))
        with patch.object(module.urllib.request, 'urlopen', side_effect=error), self.assertRaises(RuntimeError) as caught:
            module.Cloudflare('hidden-token', 'account', 'worker').request('GET')
        self.assertNotIn('secret-body', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
