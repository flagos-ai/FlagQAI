"""Exercise the submission export independently of the local verifier runtime."""
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local'))
import research_candidate_worker as worker


def package(entries):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, value in entries.items():
            archive.writestr(name, value)
    return output.getvalue()


class CandidateExportTests(unittest.TestCase):
    def test_large_unpacked_member_is_preserved_under_the_archive_limit(self):
        untouched = b'large compressed circuit' * 32768
        original = package({'dqi.kmb': untouched, 'invsqrt.kmb': b'previous circuit'})
        with patch.object(worker, 'MAX_PACKAGE_BYTES', 4096):
            output = worker.submission_package(original, b'new circuit')
        self.assertLess(len(output), 4096)
        with zipfile.ZipFile(io.BytesIO(output)) as archive:
            self.assertEqual(set(archive.namelist()), {'invsqrt.kmb', 'dqi.kmb'})
            self.assertEqual(archive.read('invsqrt.kmb'), b'new circuit')
            self.assertEqual(archive.read('dqi.kmb'), untouched)

    def test_missing_candidate_and_unsafe_package_members_are_refused(self):
        for entries in [
            {'dqi.kmb': b'other circuit'},
            {'invsqrt.kmb': b'previous circuit', '../outside.kmb': b'unsafe'},
        ]:
            with self.subTest(entries=entries), self.assertRaisesRegex(ValueError, 'Invalid archived'):
                worker.submission_package(package(entries), b'new circuit')
