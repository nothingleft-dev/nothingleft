#!/usr/bin/env python3
"""Render only the selected service configuration without printing secret values."""
import argparse
import json
import os
import sys

from env_contract import collect, write_private


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('service', choices=['API', 'UI', 'MARKETING'])
    parser.add_argument('output')
    args = parser.parse_args()
    try:
        variables = json.loads(os.environ.get('DEPLOY_VARS_JSON', '{}'))
        secrets = json.loads(os.environ.get('DEPLOY_SECRETS_JSON', '{}'))
        payload = collect(args.service, variables, secrets)
        write_private(args.output, payload['values'] if args.service == 'API' else payload)
    except (ValueError, TypeError) as error:
        # Do not expose decoder exceptions: they can include credential-bearing input.
        message = str(error) if not isinstance(error, json.JSONDecodeError) else 'Invalid deployment JSON'
        sys.exit(message)
    print(f'{args.service} configuration prepared without logging values')
