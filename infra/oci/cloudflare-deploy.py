#!/usr/bin/env python3
"""Build the marketing site, deploy its Worker and synchronize Worker secrets without exposing values."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

from env_contract import MARKETING_BUILD_KEYS, MARKETING_WORKER_SECRETS

APP = Path(__file__).resolve().parents[2] / 'apps/marketing'


def worker_name(config):
    match = re.search(r'^\s*"name":\s*"([a-z0-9-]+)"', config, re.MULTILINE)
    if not match:
        raise ValueError('wrangler.jsonc must name the Worker')
    return match.group(1)


def split(payload):
    values, secret_names = payload['values'], set(payload['secret_names'])
    if not isinstance(values, dict) or not set(values).issubset(MARKETING_BUILD_KEYS | MARKETING_WORKER_SECRETS):
        raise ValueError('Unsupported marketing configuration keys')
    if secret_names & MARKETING_BUILD_KEYS or not set(values).issubset(MARKETING_BUILD_KEYS | secret_names):
        raise ValueError('Build values must be GitHub Variables and Worker values GitHub Secrets')
    if any(not isinstance(value, str) or any(char in value for char in ('\0', '\r', '\n')) for value in values.values()):
        raise ValueError('Marketing configuration must contain single-line strings')
    build = {key: value for key, value in values.items() if key in MARKETING_BUILD_KEYS}
    secrets = {key: value for key, value in values.items() if key in MARKETING_WORKER_SECRETS}
    return build, secrets


class Cloudflare:
    """Manage Worker secrets through authenticated requests whose responses stay out of logs."""
    def __init__(self, token, account, worker):
        self.token = token
        self.base = (f'https://api.cloudflare.com/client/v4/accounts/{urllib.parse.quote(account, safe="")}'
                     f'/workers/scripts/{urllib.parse.quote(worker, safe="")}/secrets')

    def request(self, method, path='', body=None):
        request = urllib.request.Request(self.base + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                content = json.loads(response.read() or b'{}')
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Cloudflare API request failed (HTTP {error.code}); response withheld') from None
        except (urllib.error.URLError, ValueError):
            raise RuntimeError('Cloudflare API request failed; response withheld') from None
        if not content.get('success', False):
            raise RuntimeError('Cloudflare rejected the request; response withheld')
        return content.get('result')

    def sync(self, secrets):
        """Upsert contract secrets and remove contract secrets no longer configured; leave others alone."""
        existing = {entry.get('name') for entry in self.request('GET') or []}
        for key, value in sorted(secrets.items()):
            self.request('PUT', body={'name': key, 'text': value, 'type': 'secret_text'})
        for key in sorted((MARKETING_WORKER_SECRETS & existing) - set(secrets)):
            self.request('DELETE', '/' + urllib.parse.quote(key, safe=''))
        print('Worker secrets synchronized without logging values')


def build(payload):
    values, _ = split(payload)
    environment = {key: value for key, value in os.environ.items() if not key.startswith('CLOUDFLARE_')}
    for key in MARKETING_BUILD_KEYS:
        environment.pop(key, None)
    result = subprocess.run(['bun', 'run', 'build'], cwd=APP, env={**environment, **values}, timeout=1800, check=False)
    if result.returncode:
        raise RuntimeError('Marketing build failed')
    print('Marketing site built')


def deploy(payload, cli):
    _, secrets = split(payload)
    for key in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'):
        if not os.environ.get(key):
            raise ValueError(f'Missing deployment credential: {key}')
    worker = worker_name((APP / 'wrangler.jsonc').read_text())
    # Wrangler output can echo configuration and bindings; do not forward it to CI.
    with open(os.devnull, 'w') as sink:
        result = subprocess.run([cli, 'deploy'], cwd=APP, stdout=sink, stderr=sink, timeout=1800, check=False,
                                env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    if result.returncode:
        raise RuntimeError('Worker deployment failed; run wrangler deploy locally to inspect')
    print('Marketing Worker deployed')
    Cloudflare(os.environ['CLOUDFLARE_API_TOKEN'], os.environ['CLOUDFLARE_ACCOUNT_ID'], worker).sync(secrets)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('step', choices=['build', 'deploy'])
    parser.add_argument('configuration')
    parser.add_argument('--cli')
    args = parser.parse_args()
    payload = json.loads(Path(args.configuration).read_text())
    if args.step == 'build':
        build(payload)
    elif not args.cli:
        raise ValueError('deploy requires --cli')
    else:
        deploy(payload, args.cli)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, RuntimeError) as error:
        # Decoder exceptions can quote their input; only messages raised here are safe to print.
        safe = isinstance(error, (RuntimeError, ValueError)) and not isinstance(error, json.JSONDecodeError)
        message = str(error) if safe else 'unexpected error'
        sys.exit(f'Marketing build/deployment failed: {message}. Configuration values withheld.')
