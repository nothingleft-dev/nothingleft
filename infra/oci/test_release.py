"""Exercise artifact safety, deployment gates and ingress ownership."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from release_lib import extract_release, migration_digest, migration_policy, validate_id


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReleaseSafety(unittest.TestCase):
    def archive(self, root, entries):
        path = root / 'release.tar.gz'
        with tarfile.open(path, 'w:gz') as output:
            for name, kind, target in entries:
                item = tarfile.TarInfo(name)
                if kind in ('link', 'hardlink'):
                    item.type = tarfile.SYMTYPE if kind == 'link' else tarfile.LNKTYPE
                    item.linkname = target
                    output.addfile(item)
                else:
                    content = target.encode()
                    item.size = len(content)
                    output.addfile(item, io.BytesIO(content))
        return path

    def test_safe_workspace_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = self.archive(root, [
                ('packages/types/package.json', 'file', '{}'),
                ('node_modules/@nothingleft/types', 'link', '../../packages/types')])
            extract_release(archive, root / 'out')
            self.assertEqual((root / 'out/node_modules/@nothingleft/types/package.json').read_text(), '{}')

    def test_safe_bun_hardlinks_and_normalized_duplicates(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = self.archive(root, [('package.json', 'file', '{}'),
                                          ('copy.json', 'hardlink', 'package.json')])
            extract_release(archive, root / 'out')
            self.assertEqual((root / 'out/copy.json').read_text(), '{}')
            archive = self.archive(root, [('file', 'file', 'a'), ('./file', 'file', 'b')])
            with self.assertRaises(ValueError):
                extract_release(archive, root / 'another')

    def test_rejects_paths_secrets_devices_and_escaping_links(self):
        cases = [('../escape', 'file', 'bad'), ('/absolute', 'file', 'bad'),
                 ('apps/api/.env', 'file', 'secret'), ('.local/key', 'file', 'secret'),
                 ('.ssh/id_ed25519', 'file', 'secret'),
                 ('node_modules/escape', 'link', '../../../outside'),
                 ('node_modules/escape', 'link', '/etc/shadow'),
                 ('node_modules/escape', 'hardlink', '../../outside'),
                 ('node_modules/escape', 'hardlink', '/etc/shadow')]
        for entry in cases:
            with self.subTest(entry=entry), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                archive = self.archive(root, [entry])
                with self.assertRaises((ValueError, tarfile.FilterError)):
                    extract_release(archive, root / 'out')

    def test_migrations_include_names_and_contents(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            migrations = root / 'packages/db/migrations'
            migrations.mkdir(parents=True)
            file = migrations / '0001.sql'
            file.write_text('select 1;')
            first = migration_digest(root)
            (migrations / '._0001.sql').write_text('macOS metadata')
            self.assertEqual(first, migration_digest(root))
            file.write_text('select 2;')
            self.assertNotEqual(first, migration_digest(root))
            file.write_text('select 1;')
            file.rename(migrations / '0002.sql')
            self.assertNotEqual(first, migration_digest(root))

    def test_migrations_and_runtime_changes_fail_closed(self):
        old = {'bun': '1.4.2', 'pg_boss': '12.33.4', 'migrations': 'a'}
        new = {**old, 'migrations': 'b'}
        self.assertFalse(migration_policy(old, old, 'none'))
        with self.assertRaises(ValueError):
            migration_policy(old, new, 'none')
        self.assertTrue(migration_policy(old, new, 'expand'))
        with self.assertRaises(ValueError):
            migration_policy(old, {**new, 'pg_boss': '13'}, 'expand')

    def test_sha_prevents_command_injection(self):
        self.assertEqual(validate_id('a' * 40), 'a' * 40)
        for value in ('main', 'a' * 40 + ';id', '../release', 'A' * 40):
            with self.assertRaises(ValueError):
                validate_id(value)


class GitHubGate(unittest.TestCase):
    def test_rejects_pr_fork_failed_and_stale_commits(self):
        gate = load('check-deploy-ci')
        sha = 'a' * 40
        run = {'conclusion': 'success', 'event': 'push', 'head_branch': 'main',
               'head_sha': sha, 'head_repository': {'id': 1}}
        event = {'repository': {'id': 1}, 'workflow_run': run}
        gate.eligible(event, sha, sha)
        for change in ({'event': 'pull_request'}, {'head_repository': {'id': 2}},
                       {'conclusion': 'failure'}, {'head_branch': 'feature'}):
            with self.assertRaises(ValueError):
                gate.eligible({**event, 'workflow_run': {**run, **change}}, sha, sha)
        with self.assertRaises(ValueError):
            gate.eligible(event, sha, 'b' * 40)


class NetworkCleanup(unittest.TestCase):
    def test_preserves_every_preexisting_rule_even_when_add_returns_them(self):
        transport = load('ci-connection')
        client = SimpleNamespace(
            list_network_security_group_security_rules=lambda *args, **kwargs:
                SimpleNamespace(data=[SimpleNamespace(id='admin'), SimpleNamespace(id='https')], headers={}),
            add_network_security_group_security_rules=lambda *args, **kwargs:
                SimpleNamespace(data=SimpleNamespace(security_rules=[SimpleNamespace(id='admin'),
                    SimpleNamespace(id='runner'), SimpleNamespace(id='https')])) )
        model = lambda **kwargs: SimpleNamespace(**kwargs)
        oci = SimpleNamespace(core=SimpleNamespace(models=SimpleNamespace(
            AddSecurityRuleDetails=model, TcpOptions=model, PortRange=model,
            AddNetworkSecurityGroupSecurityRulesDetails=model)))
        with tempfile.TemporaryDirectory() as folder, patch.dict('sys.modules', {'oci': oci}), \
                patch.dict('os.environ', {'RUNNER_TEMP': folder, 'OCI_DEPLOY_NSG': 'nsg', 'GITHUB_RUN_ID': 'test'}), \
                patch.object(transport, 'network', return_value=client), \
                patch.object(transport.urllib.request, 'urlopen') as get:
            get.return_value.__enter__.return_value.read.return_value = b'192.0.2.1'
            transport.open_ingress()
            self.assertEqual(json.loads((Path(folder) / 'oci-deploy/rules.json').read_text()), ['runner'])


if __name__ == '__main__':
    unittest.main()
