# Agent Instructions

## Issue Tracking

This project uses **bd (beads)** for issue tracking.
Run `bd prime` for workflow context, or install hooks (`bd hooks install`) for auto-injection.

**Quick reference:**
- `bd ready` - Find unblocked work
- `bd show <id>` - View issue details
- `bd create "Title" --type task --priority 2` - Create issue
- `bd update <id> --status=in_progress` - Claim work
- `bd update <id> --title="New Title"` - Rename issue
- `bd close <id>` - Complete work

### Organization & Hierarchy
Organize large features into **epics** and break them down into **tasks**.
- `bd create "My Epic" --type epic` - Create a top-level feature
- `bd create "Subtask" --parent <epic-id>` - Create a task under an epic
- `bd update <id> --parent <epic-id>` - Move an existing task under an epic

### Dependencies
Use dependencies to control the flow of work and mark blockers.
- `bd dep add <id> <depends-on-id>` - Mark that `<id>` is blocked by `<depends-on-id>`
- `bd blocked` - List all currently blocked issues

For full workflow details: `bd prime`
