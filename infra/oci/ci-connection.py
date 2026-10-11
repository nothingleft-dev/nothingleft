#!/usr/bin/env python3
"""Provide temporary OCI runner ingress and pinned, restricted SSH deployment transport."""
import argparse
import configparser
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import urllib.request


def folder():
    directory = Path(os.environ['RUNNER_TEMP']) / 'oci-deploy'
    directory.mkdir(mode=0o700, exist_ok=True)
    return directory


def key_text(value):
    """OpenSSH rejects a key without its final newline, which pasted and CLI-set secrets lose."""
    return value.replace('\r\n', '\n').strip() + '\n'


def network():
    import oci
    directory = folder()
    key = directory / 'oci-key.pem'
    key.write_text(key_text(os.environ['OCI_API_PRIVATE_KEY']))
    key.chmod(0o600)
    parser = configparser.ConfigParser(interpolation=None)
    parser.read_string(os.environ['OCI_CONFIG'])
    parser['DEFAULT']['key_file'] = str(key)
    config = directory / 'config'
    with config.open('w') as output:
        parser.write(output)
    config.chmod(0o600)
    return oci.core.VirtualNetworkClient(oci.config.from_file(str(config)))


def open_ingress():
    """Record only newly added rule IDs so cleanup cannot remove administrator access."""
    import oci
    with urllib.request.urlopen('https://api.ipify.org', timeout=15) as response:
        address = ipaddress.IPv4Address(response.read().decode().strip())
    client = network()
    existing = set()
    page = None
    while True:
        response = client.list_network_security_group_security_rules(os.environ['OCI_DEPLOY_NSG'], page=page)
        existing.update(item.id for item in response.data)
        page = response.headers.get('opc-next-page')
        if not page:
            break
    rule = oci.core.models.AddSecurityRuleDetails(
        direction='INGRESS', protocol='6', source=f'{address}/32', source_type='CIDR_BLOCK',
        is_stateless=False, description=f'GitHub deployment run {os.environ["GITHUB_RUN_ID"]}',
        tcp_options=oci.core.models.TcpOptions(destination_port_range=oci.core.models.PortRange(min=22, max=22)))
    result = client.add_network_security_group_security_rules(os.environ['OCI_DEPLOY_NSG'],
        oci.core.models.AddNetworkSecurityGroupSecurityRulesDetails(security_rules=[rule]))
    ids = [item.id for item in result.data.security_rules if item.id not in existing]
    (folder() / 'rules.json').write_text(json.dumps(ids))
    print(f'Temporary SSH ingress created for {address}/32')


def close_ingress():
    """Remove this runner's recorded rules while preserving pre-existing ingress."""
    import oci
    state = folder() / 'rules.json'
    if state.exists():
        ids = json.loads(state.read_text())
        if ids:
            network().remove_network_security_group_security_rules(os.environ['OCI_DEPLOY_NSG'],
                oci.core.models.RemoveNetworkSecurityGroupSecurityRulesDetails(security_rule_ids=ids))
        state.unlink()
        print('Temporary SSH ingress removed')


def ssh(command, archive=None):
    from release_lib import validate_id
    directory = folder()
    key = directory / 'ssh-key'
    key.write_text(key_text(os.environ['OCI_DEPLOY_SSH_KEY']))
    key.chmod(0o600)
    known = directory / 'known_hosts'
    known.write_text(os.environ['OCI_DEPLOY_KNOWN_HOSTS'] + '\n')
    host = str(ipaddress.IPv4Address(os.environ['OCI_DEPLOY_HOST']))
    validate_id(command[1])
    args = ['ssh', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={known}',
            '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=5',
            f'nl-deploy@{host}', ' '.join(command)]
    if archive:
        with open(archive, 'rb') as source:
            subprocess.run(args, stdin=source, check=True)
    else:
        subprocess.run(args, check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['open', 'close', 'upload', 'config', 'deploy', 'rollback'])
    parser.add_argument('--release')
    parser.add_argument('--archive')
    parser.add_argument('--migration-mode', choices=['none', 'expand'], default='none')
    args = parser.parse_args()
    if args.action == 'open':
        open_ingress()
    elif args.action == 'close':
        close_ingress()
    elif args.action in ('upload', 'config'):
        ssh([args.action, args.release], args.archive)
    else:
        ssh([args.action, args.release, args.migration_mode])
