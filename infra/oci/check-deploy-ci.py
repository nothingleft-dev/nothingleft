#!/usr/bin/env python3
"""Gate deployment on passed CI for the current main commit from this repository."""
import json
import os
import urllib.request

from release_lib import validate_id


def get(path):
    request = urllib.request.Request(f'https://api.github.com/repos/{os.environ["GITHUB_REPOSITORY"]}/{path}',
        headers={'Authorization': f'Bearer {os.environ["GH_TOKEN"]}',
                 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def eligible(event, sha, latest):
    """Reject stale commits and CI events from forks or untrusted branches."""
    validate_id(sha)
    if sha != latest:
        raise ValueError('only the current main commit can be deployed')
    if 'workflow_run' in event:
        run = event['workflow_run']
        if not (run['conclusion'] == 'success' and run['event'] == 'push'
                and run['head_branch'] == 'main' and run['head_sha'] == sha
                and run['head_repository']['id'] == event['repository']['id']):
            raise ValueError('deployment requires successful same-repository main push CI')


if __name__ == '__main__':
    event = json.load(open(os.environ['GITHUB_EVENT_PATH']))
    sha = os.environ['DEPLOY_SHA']
    eligible(event, sha, get('branches/main')['commit']['sha'])
    if 'workflow_run' not in event:
        runs = get(f'actions/workflows/ci.yml/runs?head_sha={sha}&event=push&status=success&per_page=100')
        if not any(run['head_branch'] == 'main' and run['head_sha'] == sha
                   and run['head_repository']['id'] == event['repository']['id']
                   for run in runs['workflow_runs']):
            raise ValueError('manual deployment also requires successful push CI for this commit')
    print(f'CI passed for current main: {sha}')
