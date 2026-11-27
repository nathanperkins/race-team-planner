# Agent Instructions

## Issue Tracking

This project tracks work with **GitHub Issues** using the `gh` CLI.

### Essential Commands

```bash
gh issue list                        # List open issues
gh issue list --milestone "1.6"      # List open issues in a milestone
gh issue view <num>                  # Full issue details and comments
gh issue create --title="..." --body="..."
```

Link commits and PRs to issues with `Closes #<num>` so issues close automatically on merge.

### Workflow Pattern

1. **Focus**: Only work on **one epic or feature at a time**.
2. **Start**: Check open GitHub Issues (`gh issue list`) to find actionable work.
3. **Tests**: Use test-driven development. Add tests before implementing where possible. If not, add tests after. Architecture should be designed with testing in mind.
4. **Work**: Implement the task and update issue comments or descriptions if needed.
5. **Verify**: Once the epic or feature is complete, **stop and ask the user** if it is working correctly and which task to work on next.
6. **Complete**: When the user has confirmed the feature is working correctly, commit the change referencing the issue (`Closes #<num>`) and push.
7. **Document**: Update `AGENTS.md` with any information that would have made this session more efficient and check with the user before committing.

### Session Protocol

**Before ending any session, run this checklist:**

1. **Code Review**: Run comprehensive code review before committing.
2. **Quality Checks**: Run automated quality checks.
3. **Verify**: Ask the user if the feature is working correctly.
4. **Commit**: Only commit and push code once verification is confirmed.

```bash
# 1. Run comprehensive code review (REQUIRED before commit)
#    Use /prepare-commit to run all specialized reviewers
#    OR ask: "Use code-reviewer subagent to review my changes"
#    Fix any critical issues found before proceeding.

# 2. Auto-fix formatting then run all quality checks (lint, build, test).
#    Fix any issues and re-run until it passes. Do this BEFORE staging or committing.
npm run format && git hook run pre-commit

# 3. After it passes, verify the feature with the user.

# 4. Only after user confirmation, stage, commit, and push:
git add .               # Stage all changes
git commit -m "..."     # Commit the changes to git (include "Closes #<num>" when applicable)
git push                # Push the changes to git
```

### Quality Checks

> [!IMPORTANT]
> Do NOT run `npm run lint`, `npm run build`, or `npm test` individually.
> Always use `npm run format && git hook run pre-commit` as a single command.
> This auto-fixes formatting first, then runs all checks (format check, lint,
> build, test) in the correct order. Fix any issues and re-run until it passes.

### Best Practices

- Architecture should be designed with testing in mind.
- Add tests before implementing where possible. If not, add tests after.
- Only work on **one epic or feature at a time**.
- Once an epic/feature is complete, stop and ask the user for the next task.
- **Always ask the user** if a feature is working correctly before staging or committing any code changes.

### Project-Specific Architecture

- **Auth & Middleware**: This project uses **`proxy.ts`** at the root instead of `middleware.ts`. It handles base authentication and enforces the onboarding tunnel.
- **Onboarding Enforcement**: Redirection logic is centralized in **`proxy.ts`**. To prevent the "Stale Edge Cookie" issue after saving profile data, the client-side forms call `update(data)` with the new values. This refreshes the Edge cookie immediately so the Middleware sees the updated status without needing a database check.

@./README.md

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File GitHub Issues for remaining work** - Create GitHub Issues (`gh issue create`) for anything that needs follow-up
2. **Run quality gates** (if code changed) - Run `npm run format && git hook run pre-commit`. Fix any issues and re-run until it passes.
3. **Update GitHub Issues** - Reference issues in commits/PRs (`Closes #<num>`) or update open issues with progress
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
- NEVER add `Co-Authored-By` trailers to commits
