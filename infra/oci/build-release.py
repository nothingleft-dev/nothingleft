#!/usr/bin/env python3
"""Package a reproducible Linux ARM64 API release without credentials or local files."""
import argparse
import json
from pathlib import Path
import platform
import subprocess
import tarfile

from release_lib import forbidden, metadata, validate_id


def build(root, output, release, file_list=None):
    validate_id(release)
    if platform.system() != 'Linux' or platform.machine() not in ('aarch64', 'arm64'):
        raise ValueError('build releases on Linux ARM64 after bun install --frozen-lockfile')
    manifest = metadata(root, release)
    version = subprocess.check_output(['bun', '--version'], text=True).strip()
    if manifest['bun'] != version:
        raise ValueError('installed Bun does not match packageManager')
    tracked = (file_list.read_text().split('\0') if file_list else
               subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0'))
    names = {name for name in tracked if name and (
        name in ('package.json', 'bun.lock', 'tsconfig.json')
        or name.startswith(('apps/api/', 'packages/'))
        or (name.startswith('apps/') and name.count('/') == 2 and name.endswith('/package.json')))}
    for folder in [root / 'node_modules', *root.glob('apps/*/node_modules'), *root.glob('packages/*/node_modules')]:
        if folder.exists():
            names.add(str(folder.relative_to(root)))
    (root / 'release.json').write_text(json.dumps(manifest) + '\n')
    names.add('release.json')

    def safe(item):
        if forbidden(Path(item.name)) or item.name.endswith('.tsbuildinfo'):
            return None
        item.uid = item.gid = 0
        item.uname = item.gname = ''
        return item

    with tarfile.open(output, 'w:gz', dereference=False, compresslevel=1) as archive:
        for name in sorted(names):
            if not forbidden(Path(name)):
                archive.add(root / name, arcname=name, filter=safe)
    print(json.dumps(manifest))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('release')
    parser.add_argument('output', type=Path)
    parser.add_argument('--file-list', type=Path, help='NUL-separated tracked file list for an isolated build rehearsal')
    args = parser.parse_args()
    build(Path.cwd(), args.output.resolve(), args.release, args.file_list)
