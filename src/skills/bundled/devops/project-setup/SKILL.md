---
name: project-setup
description: Initialize a new coding project with best practices for the chosen stack
version: 1.0.0
tags: [project, init, scaffold]
category: devops
---

# When to Use

When the user wants to start a new project, set up a repository, or scaffold a new application.

# Procedure

1. Ask the user about:
   - Language/framework (React, Vue, Node, Python, etc.)
   - Package manager preference (npm, pnpm, yarn)
   - Any specific requirements (TypeScript, testing, linting)
2. Use `shell` to run the appropriate scaffold command
3. Use `write_file` to add/modify configuration files:
   - .gitignore (if not present)
   - README.md with project description
   - Editor config (.editorconfig)
4. Use `shell` to initialize git if not already done
5. Save the project context to memory with `memory_update`

# Pitfalls

- Always check if the directory already has files before scaffolding
- Use `--yes` or equivalent flags to avoid interactive prompts in scaffold commands
- Do not overwrite existing configuration files without asking

# Verification

- Run `ls -la` to confirm project structure
- Run the project's dev command to verify it starts correctly
