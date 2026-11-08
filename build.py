#!/usr/bin/env python3
"""Build webOS IPK without the webOS CLI (ar + control/data tarballs)."""
from __future__ import annotations
import argparse
import io
import gzip
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APPID = 'com.niels.f1tv4k'
SERVICE = APPID + '.service'
try:
    VERSION = json.loads((ROOT/'app/appinfo.json').read_text())['version']
except (OSError, ValueError, KeyError) as error:
    raise SystemExit(f'Invalid application metadata: {error}') from error

def mem_tar(files: dict[str, bytes]) -> bytes:
    bio = io.BytesIO()
    with tarfile.open(fileobj=bio, mode='w', format=tarfile.USTAR_FORMAT) as tf:
        for name, content in sorted(files.items()):
            item = tarfile.TarInfo(name='./' + name.lstrip('/'))
            item.uid = 0; item.gid = 0; item.uname='root'; item.gname='root'
            item.mtime = 0; item.mode = 0o644; item.size = len(content)
            tf.addfile(item, io.BytesIO(content))
    return gzip.compress(bio.getvalue(), mtime=0)

def ar_item(name: str, content: bytes) -> bytes:
    h = (f'{name + "/":<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(content):<10}`\n').encode('ascii')
    assert len(h) == 60
    return h + content + (b'\n' if len(content) % 2 else b'')

def build(outdir: Path):
    files = {}
    for directory, installpath in [(ROOT/'app',f'usr/palm/applications/{APPID}'),
                                  (ROOT/'service',f'usr/palm/services/{SERVICE}')]:
        for src in directory.rglob('*'):
            if src.is_file() and not any(part.startswith('.') for part in src.relative_to(directory).parts):
                files[f'{installpath}/{src.relative_to(directory).as_posix()}'] = src.read_bytes()
    total_kb = max(1, sum(map(len,files.values()))//1024)
    control = f'''Package: {APPID}
Version: {VERSION}
Section: misc
Priority: optional
Architecture: all
Maintainer: Independent webOS research
Installed-Size: {total_kb}
Description: Standalone F1 TV DASH Widevine UHD experiment
webOS-Package-Format-Version: 2
webOS-Packager-Version: 3.0.5
'''
    blobs = {'debian-binary': b'2.0\n',
             'control.tar.gz': mem_tar({'control':control.encode()}),
             'data.tar.gz': mem_tar(files)}
    output = outdir / f'{APPID}_{VERSION}_all.ipk'
    outdir.mkdir(parents=True, exist_ok=True)
    output.write_bytes(b'!<arch>\n' + b''.join(ar_item(k,blobs[k]) for k in ['debian-binary','control.tar.gz','data.tar.gz']))
    print(f'Built {output} ({output.stat().st_size} bytes)')
    print('App files:', len(files))
    return output

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('-o','--outdir',type=Path,default=ROOT/'dist')
    build(parser.parse_args().outdir)
