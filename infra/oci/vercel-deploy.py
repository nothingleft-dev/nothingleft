#!/usr/bin/env python3
"""Synchronize GitHub-owned UI configuration and deploy Next.js without exposing credentials."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

from env_contract import UI_KEYS, write_private

MARKER = 'Managed by GitHub Actions: UI'


class Vercel:
    """Manage production configuration through authenticated requests whose responses stay out of logs."""
    def __init__(self, token, project, team):
        self.token = token
        self.project = urllib.parse.quote(project, safe='')
        self.team = team

    def request(self, method, path, body=None, **query):
        query['teamId'] = self.team
        url = 'https://api.vercel.com' + path + '?' + urllib.parse.urlencode(query)
        request = urllib.request.Request(url, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Vercel API request failed (HTTP {error.code}); response withheld') from None
        except (urllib.error.URLError, ValueError):
            raise RuntimeError('Vercel API request failed; response withheld') from None

    def sync(self, payload):
        """Update selected keys and prune only owned production entries, preserving other environments."""
        values, secret_names = payload['values'], set(payload['secret_names'])
        if not isinstance(values, dict) or not set(values).issubset(UI_KEYS):
            raise ValueError('Unsupported UI environment keys')
        if not secret_names.issubset(values) or any(key.startswith('NEXT_PUBLIC_') for key in secret_names):
            raise ValueError('Browser-visible UI configuration must use GitHub Variables')
        if not values.get('NEXT_PUBLIC_API_BASE_URL'):
            raise ValueError('UI API URL is required')
        if any(not isinstance(value, str) or any(char in value for char in ('\0', '\r', '\n'))
               for value in values.values()):
            raise ValueError('UI configuration must contain single-line strings')
        settings = self.request('GET', f'/v9/projects/{self.project}')
        if settings.get('rootDirectory') != 'apps/web' or settings.get('framework') != 'nextjs':
            raise ValueError('Configure Vercel as Next.js with Root Directory apps/web first')
        existing = self.request('GET', f'/v10/projects/{self.project}/env', decrypt='false')
        entries = existing['envs'] if isinstance(existing, dict) else existing
        obsolete = []
        for entry in entries:
            target = set(entry.get('target', []))
            managed = entry.get('comment') == MARKER
            relevant = entry.get('key') in values or managed
            if 'production' not in target or not relevant:
                continue
            if target != {'production'} or entry.get('customEnvironmentIds') or entry.get('gitBranch'):
                raise ValueError('Separate managed production environment keys from preview/custom targets first')
            if managed and entry['key'] not in values:
                obsolete.append(entry['id'])
        changes = [{'key': key, 'value': value, 'target': ['production'],
                    'type': 'sensitive' if key in secret_names else 'plain', 'comment': MARKER}
                   for key, value in sorted(values.items())]
        result = self.request('POST', f'/v10/projects/{self.project}/env', changes, upsert='true')
        results = result if isinstance(result, list) else [result]
        if any(isinstance(item, dict) and (item.get('error') or item.get('failed')) for item in results):
            raise RuntimeError('Vercel rejected environment synchronization; response withheld')
        for identifier in obsolete:
            self.request('DELETE', f'/v9/projects/{self.project}/env/{urllib.parse.quote(identifier, safe="")}')
        print('Vercel production configuration synchronized without logging values')


def deploy(root, cli):
    write_private(root / '.vercel/project.json', {
        'orgId': os.environ['VERCEL_ORG_ID'], 'projectId': os.environ['VERCEL_PROJECT_ID']})
    # Build output can contain arbitrary application logging; do not forward it to CI.
    with open(os.devnull, 'w') as sink:
        result = subprocess.run([cli, 'deploy', '--prod', '--yes'], cwd=root,
                                stdout=sink, stderr=sink, timeout=1800, check=False)
    if result.returncode:
        raise RuntimeError('Vercel deployment failed; inspect the deployment in Vercel')
    print('Vercel production deployment completed')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('configuration')
    parser.add_argument('--cli', required=True)
    args = parser.parse_args()
    for key in ('VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'):
        if not os.environ.get(key):
            raise ValueError(f'Missing deployment credential: {key}')
    root = Path(__file__).resolve().parents[2]
    payload = json.loads(Path(args.configuration).read_text())
    Vercel(os.environ['VERCEL_TOKEN'], os.environ['VERCEL_PROJECT_ID'], os.environ['VERCEL_ORG_ID']).sync(payload)
    deploy(root, args.cli)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, RuntimeError):
        sys.exit('Vercel setup/deployment failed; configuration and command output withheld. Check project settings and credentials.')
