---
name: prepare-commit
description: Comprehensive pre-commit review orchestrating specialized reviewers for quality, security, performance, and tests.
---

# Prepare Commit

Comprehensive review system that runs all specialized reviewers before committing.

## What This Does

Orchestrates a complete code review workflow:

1. **Code Quality Review** - Uses code-reviewer subagent for thorough analysis
2. **Security Review** - Scans for vulnerabilities and exposed secrets
3. **Performance Review** - Identifies bottlenecks and optimization opportunities
4. **Test Coverage Review** - Ensures proper test coverage and quality
5. **Quality Checks** - Runs formatting, linting, and build
6. **Commit Message** - Suggests conventional commit format message

## Review Workflow

### Step 1: Show Changes

```bash
git diff --stat
git diff
```

### Step 2: Specialized Reviews (Parallel)

Run these reviews simultaneously for efficiency:

- **Code Quality**: Use code-reviewer subagent
  - Checks readability, maintainability, best practices
  - Verifies project conventions followed
  - Identifies code smells and anti-patterns

- **Security**: Use /security-review skill
  - Scans for vulnerabilities (OWASP Top 10)
  - Checks for exposed secrets/credentials
  - Validates authentication/authorization
  - Reviews input validation

- **Performance**: Use /perf-review skill
  - Identifies N+1 queries
  - Checks React rendering optimization
  - Reviews algorithm efficiency
  - Validates Next.js best practices

- **Test Coverage**: Use /test-review skill
  - Verifies tests exist for changes
  - Checks test quality and completeness
  - Ensures TDD practices followed
  - Validates edge cases covered

### Step 3: Automated Quality Checks

```bash
npm run format && git hook run pre-commit
```

This runs:

- Prettier formatting
- ESLint
- TypeScript compilation
- All tests

### Step 4: Issue Resolution

If any issues found:

1. List all issues by priority (Critical → Warning → Suggestion)
2. Provide specific fixes for each issue
3. Wait for fixes before proceeding
4. Re-run affected reviews after fixes

If critical issues: **STOP** - Do not proceed until fixed
If only warnings/suggestions: Summarize and allow user to decide

### Step 5: Commit Message Suggestion

Suggest a conventional commit message:

```
<type>(<scope>): <description>

<body>

<footer>
```

Types: feat, fix, docs, style, refactor, perf, test, chore
Scope: component/feature affected
Description: Clear, imperative mood

Example:

```
feat(race-details): show ineligibility indicators for racers (fixes #77)

Add visual indicators when racers are registered for races they don't
meet the license requirements for. Display red ShieldX icon and grey
badge styling to clearly show ineligibility status.

Changes:
- Pass event license requirements to RaceDetails component
- Check each racer's license level against race requirements
- Display red ShieldX icon when racer is ineligible
- Apply grey CSS class for ineligible badges
```

### Step 6: Final Checklist

Before suggesting commit:

- [ ] All critical issues resolved
- [ ] Quality checks pass
- [ ] Tests pass
- [ ] No secrets committed
- [ ] Changes align with CLAUDE.md/AGENTS.md
- [ ] No `Co-Authored-By` trailer (per project rules)

## Review Priority Levels

### 🔴 Critical (Must Fix Before Commit)

- Security vulnerabilities
- Breaking changes
- Data loss risks
- Failed tests
- Build failures

### 🟡 Warning (Should Fix)

- Code quality issues
- Performance problems
- Missing tests
- Linting warnings

### 🟢 Suggestion (Consider)

- Refactoring opportunities
- Best practice recommendations
- Style improvements

## Usage Patterns

### Full Review (Recommended)

```
You: /prepare-commit
Claude: [Runs all reviews in parallel]
Claude: [Reports issues by priority]
Claude: [Runs quality checks]
Claude: [Suggests commit message]
```

### Quick Check (Skip Specialized Reviews)

```
You: Just run quality checks before commit
Claude: [Runs npm run format && git hook run pre-commit]
Claude: [Suggests commit message if passes]
```

### Focused Review

```
You: /security-review
You: /perf-review
You: Run quality checks
Claude: [Runs only requested reviews]
```

## Integration with Project Workflow

This skill integrates with your CLAUDE.md workflow:

1. Implement feature (TDD: tests first)
2. Run `/prepare-commit` when ready
3. Address any issues found
4. Once all reviews pass:
   ```bash
   git add .
   git commit -m "message"
   git push
   bd close <id>
   bd sync
   ```

## Important Notes

- **Do NOT stage or commit automatically** - User must approve
- **Stop on critical issues** - Do not proceed until resolved
- **Re-run after major fixes** - Verify fixes didn't introduce new issues
- **Document skipped items** - If user skips warnings, note in commit message
- **Follow project rules** - No Co-Authored-By, use beads, etc.

## After Review Complete

Provide summary:

```
✅ All reviews passed
✅ Quality checks passed
✅ Tests passed (237 passing)
✅ Ready to commit

Suggested commit message:
[message here]

To commit:
git add .
git commit -m "..."
git push
bd close <id>
bd sync
```
