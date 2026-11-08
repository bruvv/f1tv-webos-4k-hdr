import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class VersionTests(unittest.TestCase):
    def test_app_and_service_versions_match(self):
        app = json.loads((ROOT / 'app/appinfo.json').read_text())
        service = json.loads((ROOT / 'service/package.json').read_text())
        self.assertRegex(app['version'], r'^\d+\.\d+\.\d+$')
        self.assertEqual(app['version'], service['version'])
        self.assertEqual(service['name'], app['id'] + '.service')

    def test_current_version_has_unique_nonempty_changelog_entry(self):
        version = json.loads((ROOT / 'app/appinfo.json').read_text())['version']
        changelog = (ROOT / 'CHANGELOG.md').read_text()
        pattern = r'^## \[' + re.escape(version) + r'\][^\n]*\n(.*?)(?=^## |\Z)'
        entries = re.findall(pattern, changelog, re.M | re.S)
        self.assertEqual(len(entries), 1)
        self.assertTrue(entries[0].strip())
        headings = re.findall(r'^## \[(\d+\.\d+\.\d+)\]', changelog, re.M)
        self.assertEqual(headings[0], version)
        self.assertEqual(len(headings), len(set(headings)))


if __name__ == '__main__':
    unittest.main()
