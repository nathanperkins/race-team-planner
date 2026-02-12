# Agent Instructions

## Issue Tracking

This project uses **bd (beads)** and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for local agent work and issue tracking.
Issues are stored in `.beads/` and are local-only (not tracked in git).

Run `bd prime` for workflow context, or install hooks (`bd hooks install`) for auto-injection.

Some issues are shared upstream using GitHub issues. Use the `gh` command to
view and update them when requested by the user.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --description="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Export issues to JSONL locally
```

### Workflow Pattern

1. **Focus**: Only work on **one epic or feature at a time**.
2. **Start**: Run `bd ready` to find actionable work within your current epic.
3. **Claim**: Use `bd update <id> --status=in_progress`.
4. **Tests**: Use test-driven development. Add tests before implementing where possible. If not, add tests after. Architecture should be designed with testing in mind.
5. **Work**: Implement the task and update descriptions if needed.
6. **Verify**: Once the epic or feature is complete, **stop and ask the user** if it is working correctly and which task to work on next.
7. **Complete**: When the user has confirmed the feature is working correctly, use `bd close <id>` to close the task and `git commit -m "<description>"` to commit the change.
8. **Document**: Update AGENTS.md with any information that would have made this session more efficient and check with the user before committing.
9. **Sync**: Always run `bd sync` to export beads locally at the end of the session.

### Key Concepts

- **Hierarchy**: Use `bd create "Subtask" --parent <epic-id>` to organize work.
- **Dependencies**: Use `bd dep add <id> <depends-on-id>` to mark blockers.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog.
- **Types**: task, bug, feature, epic, question, docs.

> [!IMPORTANT]
> Always include a clear `--description="..."` when creating beads. This helps maintain context for future work and ensures that the rationale behind a task is documented.

When organizing beads, create epics or features for any large task, and then
create subtasks under the epic or feature.

### Session Protocol

**Before ending any session, run this checklist:**

1. **Verify**: Ask the user if the feature is working correctly.
2. **Commit**: Only commit and push code once verification is confirmed.

```bash
# 1. Auto-fix formatting then run all quality checks (lint, build, test).
#    Fix any issues and re-run until it passes. Do this BEFORE staging or committing.
npm run format && git hook run pre-commit

# 2. After it passes, verify the feature with the user.

# 3. Only after user confirmation, stage, commit, and push:
git add .               # Stage all changes
git commit -m "..."     # Commit the changes to git
git push                # Push the changes to git
bd close <id>           # Close the task(s)
bd sync                 # Export beads changes locally
```

For full workflow details: `bd prime`

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
- Check `bd ready` at session start to find available work.
- Update status as you work (in_progress → closed).
- Add comments to beads as you work. This is important for maintaining context
  for future work and ensuring that the decisions and justifications for a task
  are documented.
- Create new issues with `bd create` when you discover tasks.
- Use descriptive titles and set appropriate priority/type.
- Always `bd sync` before ending session to export locally.

### Project-Specific Architecture

- **Auth & Middleware**: This project uses **`proxy.ts`** at the root instead of `middleware.ts`. It handles base authentication and enforces the onboarding tunnel.
- **Onboarding Enforcement**: Redirection logic is centralized in **`proxy.ts`**. To prevent the "Stale Edge Cookie" issue after saving profile data, the client-side forms call `update(data)` with the new values. This refreshes the Edge cookie immediately so the Middleware sees the updated status without needing a database check.

<!-- end-bv-agent-instructions -->

@./README.md

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Run `npm run format && git hook run pre-commit`. Fix any issues and re-run until it passes.
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
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
