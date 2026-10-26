"""Map GitHub service prefixes to original runtime keys and validate protected configuration."""
import json
import os
from pathlib import Path
import re

API_KEYS = set('''NODE_ENV HOST PORT LOG_LEVEL LOG_TARGETS LOG_FILE DATABASE_URL DATABASE_URL_POOLED
REDIS_URL APP_BASE_URL API_BASE_URL MCP_API_BASE_URL SESSION_COOKIE_DOMAIN TRUST_PROXY
S3_ENDPOINT S3_REGION S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PUBLIC_BUCKET
S3_PUBLIC_BUCKET_BASE_URL S3_PRIVATE_BUCKET FILES_BASE_URL BYO_ALLOW_ANY_ENDPOINT
GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET
GITHUB_APP_ID GITHUB_APP_SLUG GITHUB_APP_CLIENT_ID GITHUB_APP_CLIENT_SECRET GITHUB_APP_PRIVATE_KEY
GITHUB_APP_WEBHOOK_SECRET GITHUB_APP_BASE_URL GIT_ALLOW_PRIVATE_HOSTS
RESEND_API_KEY EMAIL_PROVIDER ZOHO_EMAIL_API_KEY ZOHO_EMAIL_ENDPOINT SMTP_HOST SMTP_PORT
SMTP_SECURE SMTP_USER SMTP_PASSWORD ASSET_BASE_URL EMAIL_FROM EMAIL_LINK_SECRET ENCRYPTION_MASTER_KEY FREE_SEAT_LIMIT
FREE_STORAGE_BYTES POSTHOG_KEY POSTHOG_HOST POSTHOG_ANALYTICS_ENABLED POSTHOG_ERRORS_ENABLED
POSTHOG_SAMPLE_RATE SUPPORT_EMAIL'''.split())
API_REQUIRED = set('''DATABASE_URL DATABASE_URL_POOLED REDIS_URL EMAIL_LINK_SECRET RESEND_API_KEY
ENCRYPTION_MASTER_KEY S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PRIVATE_BUCKET
S3_PUBLIC_BUCKET S3_PUBLIC_BUCKET_BASE_URL'''.split())
API_SENSITIVE = set('''DATABASE_URL DATABASE_URL_POOLED REDIS_URL EMAIL_LINK_SECRET
ENCRYPTION_MASTER_KEY S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_SECRET GITHUB_APP_CLIENT_SECRET GITHUB_APP_PRIVATE_KEY GITHUB_APP_WEBHOOK_SECRET
RESEND_API_KEY ZOHO_EMAIL_API_KEY SMTP_PASSWORD POSTHOG_KEY'''.split())
API_TRANSPORT = set('''OCI_CONFIG OCI_API_PRIVATE_KEY OCI_DEPLOY_SSH_KEY OCI_DEPLOY_HOST
OCI_DEPLOY_KNOWN_HOSTS OCI_DEPLOY_NSG OCI_COMPARTMENT_ID OCI_INSTANCE_ID OCI_APM_DOMAIN_ID
OCI_TOPIC_ID BACKUP_ENCRYPTION_KEY BACKUP_S3_KEY_ID BACKUP_S3_SECRET_KEY'''.split())
API_DEFAULTS = dict(NODE_ENV='production', HOST='127.0.0.1', LOG_LEVEL='info', LOG_TARGETS='json,posthog',
    APP_BASE_URL='https://work.nothingleft.dev', API_BASE_URL='https://api.nothingleft.dev',
    FILES_BASE_URL='https://files.nothingleft.dev', SESSION_COOKIE_DOMAIN='.nothingleft.dev',
    TRUST_PROXY='127.0.0.1/32,::1/128', S3_REGION='auto', BYO_ALLOW_ANY_ENDPOINT='false',
    EMAIL_FROM='Nothing Left <noreply@notifications.nothingleft.dev>',
    POSTHOG_ANALYTICS_ENABLED='false', POSTHOG_ERRORS_ENABLED='false', POSTHOG_SAMPLE_RATE='1',
    POSTHOG_HOST='https://us.i.posthog.com', SUPPORT_EMAIL='admin@nothingleft.dev')
UI_KEYS = {'NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_BYO_ALLOW_ANY_ENDPOINT', 'NEXT_PUBLIC_SUPPORT_EMAIL'}
# One GA4 property for the marketing site and the app's auth pages, so a visit and its sign-up join up.
UI_SHARED = {'NEXT_PUBLIC_GA_MEASUREMENT_ID': 'MARKETING_PUBLIC_GA_MEASUREMENT_ID'}
UI_TRANSPORT = {'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'VERCEL_CLI_VERSION'}
UI_DEFAULTS = {'NEXT_PUBLIC_API_BASE_URL': 'https://api.nothingleft.dev',
               'NEXT_PUBLIC_BYO_ALLOW_ANY_ENDPOINT': 'false',
               'NEXT_PUBLIC_SUPPORT_EMAIL': 'admin@nothingleft.dev'}
MARKETING_BUILD_KEYS = {'PUBLIC_GA_MEASUREMENT_ID', 'PUBLIC_CLARITY_PROJECT_ID'}
MARKETING_WORKER_SECRETS = {'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'}
MARKETING_TRANSPORT = {'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'}


def validate_api(values):
    if not isinstance(values, dict) or any(key not in API_KEYS for key in values):
        raise ValueError('API configuration contains unsupported keys')
    missing = sorted(key for key in API_REQUIRED if not values.get(key))
    if missing:
        raise ValueError('Missing API configuration keys: ' + ', '.join(missing))
    for key, value in values.items():
        if not isinstance(value, str) or any(char in value for char in ('\0', '\r', '\n')):
            raise ValueError('API configuration values must be single-line strings')
    if values.get('NODE_ENV') != 'production' or values.get('HOST') != '127.0.0.1':
        raise ValueError('API deployment requires production mode and a loopback listener')
    if values.get('BYO_ALLOW_ANY_ENDPOINT', 'false') != 'false':
        raise ValueError('BYO_ALLOW_ANY_ENDPOINT cannot be enabled in production')
    if values.get('GIT_ALLOW_PRIVATE_HOSTS', 'false') != 'false':
        raise ValueError('GIT_ALLOW_PRIVATE_HOSTS cannot be enabled in production')
    # The API refuses to start with some of the GitHub App's settings and not the rest.
    app = ('GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET',
           'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_WEBHOOK_SECRET')
    if any(values.get(key) for key in app) and not all(values.get(key) for key in app):
        raise ValueError('GitHub App configuration needs all of: ' + ', '.join(app))
    return values


def collect(service, variables, secrets):
    """Strip the service prefix and keep transport credentials out of app configuration."""
    for source in (variables, secrets):
        if not isinstance(source, dict) or any(not isinstance(name, str) or not isinstance(value, str)
                                              for name, value in source.items()):
            raise ValueError('GitHub configuration must contain string key/value pairs')
    prefix = service + '_'
    if service == 'API':
        keys, transport, defaults, sensitive = API_KEYS, API_TRANSPORT, API_DEFAULTS, API_SENSITIVE
    elif service == 'UI':
        keys, transport, defaults, sensitive = UI_KEYS, UI_TRANSPORT, UI_DEFAULTS, set()
    elif service == 'MARKETING':
        keys = MARKETING_BUILD_KEYS | MARKETING_WORKER_SECRETS
        transport, defaults, sensitive = MARKETING_TRANSPORT, {}, MARKETING_WORKER_SECRETS
    else:
        raise ValueError('Unknown deployment service')
    values = dict(defaults)
    secret_names = set()
    for source, private in ((variables, False), (secrets, True)):
        for name, value in source.items():
            if not name.startswith(prefix):
                continue
            key = name.removeprefix(prefix)
            if key in transport:
                continue
            if key not in keys:
                raise ValueError(f'Unsupported GitHub configuration name: {name}')
            if not value:
                continue
            if name in variables and variables[name] and name in secrets and secrets[name]:
                raise ValueError(f'Configure {name} in either Secrets or Variables, not both')
            if key in sensitive and not private:
                raise ValueError(f'{name} must be a GitHub Secret')
            if key.startswith(('NEXT_PUBLIC_', 'PUBLIC_')) and private:
                raise ValueError(f'{name} is browser-visible; configure it as a Variable')
            if any(char in value for char in ('\0', '\r', '\n')):
                raise ValueError(f'{name} must be a single-line value')
            values[key] = value
            if private:
                secret_names.add(key)
    if service == 'API':
        values.pop('PORT', None)
        validate_api(values)
    elif service == 'UI':
        for key, name in UI_SHARED.items():
            if secrets.get(name):
                raise ValueError(f'{name} is browser-visible; configure it as a Variable')
            value = variables.get(name, '')
            if any(char in value for char in ('\0', '\r', '\n')):
                raise ValueError(f'{name} must be a single-line value')
            if value:
                values[key] = value
        if not values.get('NEXT_PUBLIC_API_BASE_URL'):
            raise ValueError(f'{service}_NEXT_PUBLIC_API_BASE_URL is required')
    return {'values': values, 'secret_names': sorted(secret_names)}


def write_private(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(value, output)
        output.write('\n')


def systemd_env(values):
    return ''.join(f'{key}={json.dumps(value, ensure_ascii=False)}\n' for key, value in sorted(values.items()))


def parse_env(text):
    """Read retained environment files as data; never evaluate shell substitutions."""
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            raise ValueError('Invalid environment file format')
        if value.startswith('"') and value.endswith('"'):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                value = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        values[key] = value
    return values
