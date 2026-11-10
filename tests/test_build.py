import contextlib
import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('ipk_build', ROOT / 'build.py')
assert SPEC is not None and SPEC.loader is not None
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def members(data):
    assert data[:8] == b'!<arch>\n'
    offset = 8
    result = {}
    while offset < len(data):
        header = data[offset:offset + 60]
        assert header[58:60] == b'`\n'
        size = int(header[48:58])
        name = header[:16].decode().strip().rstrip('/')
        result[name] = data[offset + 60:offset + 60 + size]
        offset += 60 + size + size % 2
    assert offset == len(data)
    return result


class BuildTests(unittest.TestCase):
    def test_reproducible_complete_package(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            output = BUILDER.build(Path(directory))
            first = output.read_bytes()
            time.sleep(1.1)  # Cross gzip timestamp boundary to catch nondeterministic builds.
            second = BUILDER.build(Path(directory)).read_bytes()
        self.assertEqual(hashlib.sha256(first).digest(), hashlib.sha256(second).digest())
        archive = members(first)
        self.assertEqual(set(archive), {'debian-binary', 'control.tar.gz', 'data.tar.gz'})
        self.assertEqual(archive['debian-binary'], b'2.0\n')
        with tarfile.open(fileobj=io.BytesIO(archive['data.tar.gz']), mode='r:gz') as data:
            files = {}
            for entry in data:
                if entry.isfile():
                    stream = data.extractfile(entry)
                    assert stream is not None
                    files[entry.name] = stream.read()
        app = './usr/palm/applications/com.bruvv.f1tv/'
        service = './usr/palm/services/com.bruvv.f1tv.service/'
        self.assertEqual(json.loads(files[app+'appinfo.json'])['version'], BUILDER.VERSION)
        self.assertIn(app+'vendor/shaka-player.compiled.js', files)
        self.assertIn(app+'vendor/SHAKA-LICENSE', files)
        self.assertIn(service+'relay-policy.js', files)
        self.assertIn(service+'auth.js', files)
        self.assertIn(service+'session-lease.js', files)
        self.assertNotIn(service+'playback-lease.js', files)
        self.assertIn(service+'FASTF1-LICENSE', files)
        self.assertNotIn(b'<script src="https://', files[app+'index.html'])
        self.assertFalse(any('.DS_Store' in name for name in files))


if __name__ == '__main__':
    unittest.main()
