---
type: sample
---

# Basic Shell Commands

Text under the title is not a card. Each heading with no sub-headings becomes a card, and its parent heading becomes a tag.

## Files

### List a directory

Shows the files in the current directory. Add `-l` for details and `-a` to include hidden files.

```bash
# a comment inside a code block is not a heading
ls -la
```

_Refs: [1]_

---
### Copy a file

```bash
cp notes.txt notes-backup.txt
```

## Navigation

### Show the current directory

`pwd` prints the full path of the directory you are in.

### Change directory

`cd /path` moves into a directory. `cd ..` moves up one level.

## References

- [1] Your shell's manual page: `man ls`
