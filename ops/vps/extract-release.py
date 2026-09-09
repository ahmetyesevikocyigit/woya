#!/usr/bin/python3
"""Extract regular files only into a fresh directory. Called as woya, never root."""
import shutil,sys,tarfile
from pathlib import Path,PurePosixPath
root=Path(sys.argv[2]).resolve()
if any(root.iterdir()):raise ValueError('Release directory must be empty')
with tarfile.open(sys.argv[1],'r:gz') as t:
 members=t.getmembers();total=0
 for m in members:
  p=PurePosixPath(m.name)
  if p.is_absolute() or '..' in p.parts or not(m.isfile() or m.isdir()):raise ValueError('Unsafe archive member')
  if any(part.startswith('.env') or part=='.git' for part in p.parts):raise ValueError('Forbidden archive member')
  total+=m.size
  if total>2*1024**3 or len(members)>100000:raise ValueError('Archive limit exceeded')
 for m in members:
  dest=root/m.name
  if not dest.resolve().is_relative_to(root):raise ValueError('Unsafe target')
  if m.isdir():dest.mkdir(parents=True,exist_ok=True,mode=0o755)
  else:
   dest.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
   with t.extractfile(m) as src,dest.open('xb') as out:shutil.copyfileobj(src,out)
   dest.chmod(0o755 if m.mode & 0o111 else 0o644)
