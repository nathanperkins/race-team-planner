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

For full workflow details: `bd prime`
