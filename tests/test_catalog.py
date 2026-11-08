import hashlib
import json
import pathlib
import tempfile
import unittest

from catalog import REPOSITORY, make_catalog

ROOT = pathlib.Path(__file__).resolve().parents[1]


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.info = json.loads((ROOT / 'app/appinfo.json').read_text())
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.ipk = pathlib.Path(self.directory.name) / (
            f'{self.info["id"]}_{self.info["version"]}_all.ipk'
        )
        self.contents = b'!<arch>\nexample package for catalog unit test'
        self.ipk.write_bytes(self.contents)

    def test_metadata_and_hash_come_from_package(self):
        package = make_catalog(self.info, self.ipk)['packages'][0]
        manifest = package['manifest']
        self.assertEqual(package['id'], 'com.bruvv.f1tv')
        self.assertEqual(package['shortDescription'], self.info['description'])
        self.assertEqual(manifest['version'], self.info['version'])
        self.assertEqual(manifest['ipkSize'], len(self.contents))
        self.assertEqual(manifest['ipkHash']['sha256'],
                         hashlib.sha256(self.contents).hexdigest())
        self.assertEqual(manifest['sourceUrl'], REPOSITORY)
        self.assertEqual(manifest['ipkUrl'],
                         f'{REPOSITORY}/releases/download/'
                         f'v{self.info["version"]}/{self.ipk.name}')
        self.assertEqual(manifest['iconUri'], package['iconUri'])
        self.assertIn(f'/v{self.info["version"]}/app/icon.png',
                      manifest['iconUri'])

    def test_changed_bytes_change_hash_and_size(self):
        first = make_catalog(self.info, self.ipk)['packages'][0]['manifest']
        self.ipk.write_bytes(self.contents + b'changed')
        second = make_catalog(self.info, self.ipk)['packages'][0]['manifest']
        self.assertNotEqual(first['ipkHash'], second['ipkHash'])
        self.assertEqual(second['ipkSize'], first['ipkSize'] + 7)

    def test_wrong_filename_is_rejected(self):
        with self.assertRaises(ValueError):
            make_catalog(self.info, self.ipk.with_name('wrong.ipk'))

    def test_invalid_archive_is_rejected(self):
        self.ipk.write_bytes(b'not an archive')
        with self.assertRaises(ValueError):
            make_catalog(self.info, self.ipk)


if __name__ == '__main__':
    unittest.main()
