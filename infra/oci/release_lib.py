"""Validate release artifacts and compatibility before privileged deployment operations."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile

RELEASE_ID = re.compile(r'[0-9a-f]{40}\Z')
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_EXPANDED = 2 * 1024 * 1024 * 1024


def validate_id(value):
    if not RELEASE_ID.fullmatch(value):
        raise ValueError('release must be a lowercase 40-character SHA')
    return value


def forbidden(path):
    return any(part in ('.git', '.local', '.ssh', '__pycache__', '.DS_Store')
               or part.startswith('._')
               or part == '.env' or part.startswith('.env.')
               or part.endswith(('.pem', '.key')) for part in path.parts)


def migration_digest(root):
    digest = hashlib.sha256()
    folder = root / 'packages/db/migrations'
    files = sorted(path for path in folder.rglob('*') if path.is_file()
                   and path.suffix in ('.sql', '.json') and not forbidden(path.relative_to(folder)))
    if not files:
        raise ValueError('migration history is missing')
    for path in files:
        digest.update(str(path.relative_to(folder)).encode() + b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


def metadata(root, release):
    package = json.loads((root / 'package.json').read_text())
    boss = json.loads((root / 'apps/api/node_modules/pg-boss/package.json').read_text())
    return {'release': release, 'architecture': 'aarch64',
            'bun': package['packageManager'].removeprefix('bun@'),
            'pg_boss': boss['version'], 'migrations': migration_digest(root)}


def extract_release(archive, destination):
    """Reject escaping paths, links and credential files before extracting any archive member."""
    if archive.stat().st_size > MAX_ARCHIVE:
        raise ValueError('archive exceeds 512 MiB')
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        if len(members) > 150000 or sum(item.size for item in members) > MAX_EXPANDED:
            raise ValueError('release exceeds extraction limits')
        seen = set()
        for item in members:
            path = PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or forbidden(path):
                raise ValueError(f'forbidden archive path: {item.name}')
            canonical = str(path)
            if canonical in seen or not (item.isfile() or item.isdir() or item.issym() or item.islnk()):
                raise ValueError('duplicate path or unsupported archive entry')
            seen.add(canonical)
        source.extractall(destination, members=members, filter='data')


def migration_policy(current, candidate, mode):
    """Require reviewed schema compatibility and block unplanned worker-version overlap."""
    if current['bun'] != candidate['bun'] or current['pg_boss'] != candidate['pg_boss']:
        raise ValueError('Bun/pg-boss version changes require a separate maintenance upgrade')
    changed = current['migrations'] != candidate['migrations']
    if changed and mode != 'expand':
        raise ValueError('migration history changed; manually approve an expand-compatible deployment')
    return changed
