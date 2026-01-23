---
description: Helps prepare and verify local changes before committing to git.
---

# Prepare Commit

## How to use it

1. Review all changes in the git diff.
2. Evaluate code changes for correctness, readability, and maintainability.
3. Call out any potential security issues, like staged tokens or secrets.
4. Run `npm run format`, `npm run lint`, and `npm run build` to check for formatting and build errors.
5. Resolve any problems and repeat until the code is ready to commit.
6. Do not stage or commit anything.
7. Suggest a commit message with a clear description in the conventional commit format and ask the user for approval.

## Code Review

When reviewing code, follow the checklist below.

1. **Correctness**: Does the code do what it's supposed to?
2. **Style**: Does it follow project conventions? Is the code easy to read?
3. **Maintainability**: Is the code easy to maintain?
4. **Security**: Are there any security issues?
5. **Secrets**: Are there any secrets in the code?
6. **Edge cases**: Are error conditions handled?
7. **Performance**: Are there obvious inefficiencies?
