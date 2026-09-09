#!/usr/bin/python3
"""Forced SSH command. No shell, forwarding, arbitrary file paths or privileged actions."""
import hashlib, os, re, sys, tempfile
from pathlib import Path
m=re.fullmatch(r'release ([a-f0-9]{40}) ([a-f0-9]{64})',os.environ.get('SSH_ORIGINAL_COMMAND',''))
if not m: sys.exit('Only WOYA release upload is permitted')
sha,digest=m.groups(); root=Path('/var/lib/woya-incoming'); root.mkdir(mode=0o700,exist_ok=True)
fd,name=tempfile.mkstemp(prefix='upload-',dir=root); h=hashlib.sha256(); n=0
try:
 with os.fdopen(fd,'wb') as f:
  while chunk:=sys.stdin.buffer.read(1024*1024):
   n+=len(chunk)
   if n>700*1024*1024: raise ValueError('Package too large')
   h.update(chunk);f.write(chunk)
 if h.hexdigest()!=digest: raise ValueError('Checksum mismatch')
 os.replace(name,root/(sha+'.tar.gz'))
 print('WOYA package received; activation and health checks run separately.')
finally:
 if os.path.exists(name): os.unlink(name)
