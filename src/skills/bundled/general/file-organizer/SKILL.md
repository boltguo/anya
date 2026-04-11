---
name: file-organizer
description: Analyze and organize files in a directory based on type, date, or custom rules
version: 1.0.0
tags: [files, organize, cleanup]
category: general
---

# When to Use

When the user wants to clean up, organize, or sort files in a directory.

# Procedure

1. Use `list_dir` to scan the target directory
2. Analyze file types, sizes, and naming patterns
3. Propose an organization plan to the user:
   - Group by extension (images/, documents/, code/)
   - Group by date (2024-01/, 2024-02/)
   - Custom grouping based on naming patterns
4. Wait for user approval before moving any files
5. Use `shell` with `mv` commands to reorganize
6. Generate a summary of what was moved

# Pitfalls

- Never delete files without explicit user confirmation
- Always show the full plan before executing
- Watch out for hidden files (dotfiles) -- skip them unless asked
- Be careful with symlinks

# Verification

Use `list_dir` on the organized directories to confirm the new structure.
