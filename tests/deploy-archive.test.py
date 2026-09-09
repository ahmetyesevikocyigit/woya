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

 def link_archive(self, items):
  with tempfile.TemporaryDirectory() as d:
   archive=Path(d)/'input.tar.gz';target=Path(d)/'output';target.mkdir()
   with tarfile.open(archive,'w:gz') as t:
    for name,link in items:
     m=tarfile.TarInfo(name)
     if link is not None:m.type=tarfile.SYMTYPE;m.linkname=link
     else:m.size=2
     t.addfile(m,io.BytesIO(b'{}') if link is None else None)
   return subprocess.run(['python3','ops/vps/extract-release.py',str(archive),str(target)],capture_output=True).returncode
 def test_relative_package_link(self):self.assertEqual(self.link_archive([('store/pkg.js',None),('modules/pkg','../store/pkg.js')]),0)
 def test_link_escape(self):self.assertNotEqual(self.link_archive([('pkg','../outside')]),0)
 def test_dangling_link(self):self.assertNotEqual(self.link_archive([('pkg','missing')]),0)
 def test_link_chain(self):self.assertNotEqual(self.link_archive([('file',None),('link','file'),('chain','link')]),0)
 def test_write_through_link(self):self.assertNotEqual(self.link_archive([('file',None),('link','file'),('link/evil',None)]),0)
 def test_duplicate_member(self):self.assertNotEqual(self.link_archive([('file',None),('file',None)]),0)
 def test_hardlink(self):self.assertNotEqual(self.run_archive('link',tarfile.LNKTYPE),0)

if __name__=='__main__':unittest.main()
