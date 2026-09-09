#!/usr/bin/python3
"""Extract files and validated in-archive relative links as woya, never root."""
import posixpath
import shutil
import sys
import tarfile
from pathlib import Path, PurePosixPath

root = Path(sys.argv[2]).resolve()
if any(root.iterdir()):
    raise ValueError('Release directory must be empty')
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    members = archive.getmembers()
    total = 0
    entries = {}
    for member in members:
        path = PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir() or member.issym()):
            raise ValueError('Unsafe archive member')
        if any(part.startswith('.env') or part == '.git' for part in path.parts):
            raise ValueError('Forbidden archive member')
        name = str(path)
        if name in entries:
            raise ValueError('Duplicate archive member')
        entries[name] = member
        total += member.size
        if total > 2 * 1024**3 or len(members) > 100000:
            raise ValueError('Archive limit exceeded')
    links = {name for name, member in entries.items() if member.issym()}
    for name, member in entries.items():
        # No archive entry may be written through a link, regardless of order.
        if any(str(parent) in links for parent in PurePosixPath(name).parents):
            raise ValueError('Archive member beneath symlink')
        if member.issym():
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), member.linkname))
            target_path = PurePosixPath(target)
            if PurePosixPath(member.linkname).is_absolute() or target_path.is_absolute() or '..' in target_path.parts:
                raise ValueError('Symlink escapes release')
            if target not in entries or entries[target].issym():
                raise ValueError('Dangling or chained symlink')
            if any(str(parent) in links for parent in target_path.parents):
                raise ValueError('Symlink target beneath symlink')
    # Create links last; all writes occur in ordinary directories.
    for name, member in entries.items():
        if member.issym():
            continue
        dest = root / name
        if not dest.resolve().is_relative_to(root):
            raise ValueError('Unsafe target')
        if member.isdir():
            dest.mkdir(parents=True, exist_ok=True, mode=0o755)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with archive.extractfile(member) as src, dest.open('xb') as out:
                shutil.copyfileobj(src, out)
            dest.chmod(0o755 if member.mode & 0o111 else 0o644)
    for name in links:
        dest = root / name
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        dest.symlink_to(entries[name].linkname)
