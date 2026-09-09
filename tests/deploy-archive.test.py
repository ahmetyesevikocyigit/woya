import io, subprocess, tarfile, tempfile, unittest
from pathlib import Path

class ArchiveSafety(unittest.TestCase):
 def run_archive(self,name,kind=None):
  with tempfile.TemporaryDirectory() as d:
   archive=Path(d)/'input.tar.gz';target=Path(d)/'output';target.mkdir()
   with tarfile.open(archive,'w:gz') as t:
    m=tarfile.TarInfo(name)
    if kind: m.type=kind;m.linkname='/etc/passwd'
    else:m.size=2
    t.addfile(m,io.BytesIO(b'{}') if not kind else None)
   result=subprocess.run(['python3','ops/vps/extract-release.py',str(archive),str(target)],capture_output=True)
   return result.returncode
 def test_safe_file(self):self.assertEqual(self.run_archive('./package.json'),0)
 def test_traversal(self):self.assertNotEqual(self.run_archive('../escape'),0)
 def test_absolute(self):self.assertNotEqual(self.run_archive('/tmp/escape'),0)
 def test_symlink(self):self.assertNotEqual(self.run_archive('link',tarfile.SYMTYPE),0)
 def test_secret(self):self.assertNotEqual(self.run_archive('.env.local'),0)

if __name__=='__main__':unittest.main()
