# Agent Instructions

## Issue Tracking

This project uses **bd (beads)** and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking.
Issues are stored in `.beads/` and tracked in git.

Run `bd prime` for workflow context, or install hooks (`bd hooks install`) for auto-injection.

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
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Focus**: Only work on **one epic or feature at a time**.
2. **Start**: Run `bd ready` to find actionable work within your current epic.
3. **Claim**: Use `bd update <id> --status=in_progress`.
4. **Work**: Implement the task and update descriptions if needed.
5. **Verify**: Once the epic or feature is complete, **stop and ask the user** if it is working correctly and which task to work on next.
6. **Complete**: When the user has confirmed the feature is working correctly, use `bd close <id>` to close the task and `git commit -m "<description>"` to commit the change.
7. **Document**: Update AGENTS.md with any information that would have made this session more efficient and check with the user before committing.
8. **Sync**: Always run `bd sync` to sync beads at the end of the session.

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
# First, verify the feature is working correctly with the user, then run:
husky check             # Run pre-commit checks
git add .               # Stage all changes
git commit -m "..."     # Commit the changes to git.
git push                # Push the changes to git.
bd close <id>           # Close the task(s).
bd sync                 # Commit beads changes
```

For full workflow details: `bd prime`

### Best Practices

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
- Always `bd sync` before ending session.
- Update AGENTS.md with any information that would have made this session more efficient and check it with the user.

<!-- end-bv-agent-instructions -->
