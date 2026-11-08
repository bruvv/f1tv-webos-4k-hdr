#!/usr/bin/env python3
"""Generate Glasshouse catalog metadata from the actual published IPK."""
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
REPOSITORY = 'https://github.com/bruvv/f1tv-webos-4k-hdr'
RAW = 'https://raw.githubusercontent.com/bruvv/f1tv-webos-4k-hdr'


def make_catalog(info, ipk):
    expected = f'{info["id"]}_{info["version"]}_all.ipk'
    if ipk.name != expected:
        raise ValueError(f'Expected {expected}, got {ipk.name}')
    contents = ipk.read_bytes()
    if not contents.startswith(b'!<arch>\n'):
        raise ValueError('Not an IPK/ar archive')
    icon = f'{RAW}/v{info["version"]}/app/{info["icon"]}'
    return {'packages': [{
        'id': info['id'],
        'title': info['title'],
        'shortDescription': info['description'],
        'iconUri': icon,
        'manifest': {
            'id': info['id'],
            'version': info['version'],
            'title': info['title'],
            'appDescription': info['description'],
            'iconUri': icon,
            'sourceUrl': REPOSITORY,
            'ipkUrl': f'{REPOSITORY}/releases/download/'
                      f'v{info["version"]}/{expected}',
            'ipkHash': {'sha256': hashlib.sha256(contents).hexdigest()},
            'ipkSize': len(contents),
        },
    }]}


if __name__ == '__main__':
    try:
        info = json.loads((ROOT / 'app/appinfo.json').read_text())
        catalog = make_catalog(info, pathlib.Path(sys.argv[1]))
        (ROOT / 'repo.json').write_text(json.dumps(catalog, indent=2) + '\n')
    except (OSError, ValueError, KeyError, IndexError) as error:
        sys.exit(f'Catalog generation failed: {error}')
