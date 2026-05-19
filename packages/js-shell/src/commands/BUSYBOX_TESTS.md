# BusyBox Compatibility Tests

These colocated specs are aligned against BusyBox 1.37.0 testsuite cases.

Source archive:

- https://busybox.net/downloads/busybox-1.37.0.tar.bz2

Current migrated coverage:

- `cat.spec.ts`: `testsuite/cat/*`, supported `cat.tests` cases for `-e`, `-v`, `-n`, `-b`
- `echo.spec.ts`: `testsuite/echo/*`
- `dirname.spec.ts`: `testsuite/dirname/*`
- `head.spec.ts`: `testsuite/head.tests`
- `tail.spec.ts`: `testsuite/tail/*`, supported `tail.tests` `-c +N` cases
- `mkdir.spec.ts`: `testsuite/mkdir/*`
- `pwd.spec.ts`: `testsuite/pwd/pwd-prints-working-directory`
- `true-false.spec.ts`: `testsuite/true/*`, `testsuite/false/*`
- `test.spec.ts`: `testsuite/test.tests`
- `printf.spec.ts`: supported `testsuite/printf.tests` cases
- `cmp.spec.ts`: `testsuite/cmp/cmp-detects-difference`
- `cp.spec.ts`: supported `testsuite/cp.tests` and `testsuite/cp/*` cases for files, directories, symlink following/preservation, `-R`, `-a`, and `--parents`
- `touch.spec.ts`: `testsuite/touch/*`
- `ln.spec.ts`: `testsuite/ln/*`
- `mv.spec.ts`: supported `testsuite/mv/*` cases for files, directories, symlinks, `-t`, source removal, and refusing directory-to-subdirectory moves
- `rm.spec.ts`: `testsuite/rm/rm-removes-file`, plus BusyBox-style missing file, `-f`, recursive directory, and symlink removal semantics
- `readlink.spec.ts`: `testsuite/readlink.tests` cases for regular files, symlinks, `-f`, invalid links, and normalized paths
- `wc.spec.ts`: `testsuite/wc/*`
- `sort.spec.ts`: supported `testsuite/sort.tests` cases
- `uniq.spec.ts`: supported `testsuite/uniq.tests` cases
- `tr.spec.ts`: supported `testsuite/tr.tests` and `testsuite/tr/*` cases
- `cut.spec.ts`: supported `testsuite/cut.tests` and `testsuite/cut/*` cases
- `xargs.spec.ts`: supported `testsuite/xargs.tests` cases
- `grep.spec.ts`: supported `testsuite/grep.tests` cases
- `find.spec.ts`: supported `testsuite/find.tests` cases
- `ls.spec.ts`: supported `testsuite/ls.tests` and `testsuite/ls/*` cases
- `sed.spec.ts`: supported `testsuite/sed.tests` cases for stdin/files, `-n`, `-e`, substitution flags, arbitrary delimiters, basic addresses, `p/d/a/i`, `-i`, and replacement backrefs

The upstream shell harness uses a real filesystem, process model, and helper
applets. Specs in this package keep the same command behavior and expected
results where those semantics are meaningful in the in-memory browser VFS.
