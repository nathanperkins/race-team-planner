# Comprehensive Code Review System

This project includes a multi-layered code review system to ensure quality, security, performance, and test coverage.

## Quick Start

### Full Pre-Commit Review

```
/prepare-commit
```

This orchestrates all specialized reviewers and provides a comprehensive analysis before committing.

### Individual Reviews

```
/security-review    # Security vulnerabilities and secrets
/perf-review        # Performance bottlenecks
/test-review        # Test coverage and quality
```

### Use Code-Reviewer Subagent

```
Use the code-reviewer subagent to review my changes
```

Claude will automatically delegate to the specialized code-reviewer for thorough analysis.

## System Architecture

### 🎯 Main Orchestrator

**`/prepare-commit`** - Coordinates all reviews

- Location: `.agent/skills/prepare-commit/`
- Runs all specialized reviews in parallel
- Executes quality checks
- Suggests commit messages
- Follows project conventions

### 🔍 Code-Reviewer Subagent

**`code-reviewer`** - Core quality review

- Location: `.agent/subagents/code-reviewer.md`
- Deep code quality analysis
- Security checks
- Best practices validation
- Project-specific rules

### 🛡️ Specialized Review Skills

#### Security Review

**`/security-review`**

- OWASP Top 10 vulnerabilities
- Exposed secrets/credentials
- Authentication/authorization
- Input validation
- API security

#### Performance Review

**`/perf-review`**

- N+1 query detection
- React rendering optimization
- Algorithm efficiency
- Next.js best practices
- Database query optimization

#### Test Coverage Review

**`/test-review`**

- Test existence verification
- Test quality assessment
- TDD compliance
- Edge case coverage
- Test anti-patterns

## Review Workflow

### Standard Workflow

1. Write code (TDD: tests first)
2. Run `/prepare-commit`
3. Review findings by priority:
   - 🔴 Critical: Must fix
   - 🟡 Warning: Should fix
   - 🟢 Suggestion: Consider
4. Fix issues
5. Re-run if major changes
6. Commit when clean

### Quick Workflow

1. Write code
2. Ask: "Use code-reviewer to review"
3. Fix issues
4. Run: `npm run format && git hook run pre-commit`
5. Commit

### Focused Workflow

1. Security-sensitive change → `/security-review`
2. Performance-critical change → `/perf-review`
3. New feature → `/test-review`
4. Run quality checks
5. Commit

## Review Coverage

### Code Quality

- ✅ Readability and clarity
- ✅ Function/variable naming
- ✅ Code duplication (DRY)
- ✅ Error handling
- ✅ TypeScript types
- ✅ Project conventions

### Security

- ✅ OWASP Top 10
- ✅ Secrets detection
- ✅ Auth/authorization
- ✅ Input validation
- ✅ SQL injection prevention
- ✅ XSS prevention

### Performance

- ✅ N+1 queries
- ✅ Database indexes
- ✅ React optimization
- ✅ Server/Client components
- ✅ Asset optimization
- ✅ Algorithm efficiency

### Testing

- ✅ Test existence
- ✅ Test quality (AAA pattern)
- ✅ Edge cases
- ✅ Integration tests
- ✅ Mocking patterns
- ✅ Coverage goals

## Integration with Project

### Follows CLAUDE.md

- Uses GitHub Issues (gh) for tracking
- No `Co-Authored-By` trailers
- TDD workflow
- Quality gate before commit
- Proper commit messages

### Quality Checks

```bash
npm run format && git hook run pre-commit
```

Runs:

- Prettier formatting
- ESLint
- TypeScript compilation
- All tests (237 tests)

### Commit Process

```bash
git add .
git commit -m "message"
git push
```

## Review Priority System

### 🔴 Critical (Blocking)

**Must fix before committing**

- Security vulnerabilities
- Breaking changes
- Data loss risks
- Failed tests
- Build errors

### 🟡 Warning (Important)

**Should fix**

- Code quality issues
- Performance problems
- Missing tests
- Linting warnings

### 🟢 Suggestion (Optional)

**Consider improving**

- Refactoring opportunities
- Best practices
- Style improvements

## Project-Specific Checks

### Race Team Planner Specifics

- Next.js App Router patterns
- Prisma query optimization
- Discord integration security
- iRacing API usage
- NextAuth configuration
- React Server Components

### Architecture Rules

- `proxy.ts` for auth (not `middleware.ts`)
- Server actions in `app/actions.ts`
- CSS classes over inline styles
- Proper TypeScript types
- Test coverage goals

## Optional: Automated Hooks

To enable automated reviews after file edits, add to `~/.claude/settings.local.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Run a quick security check on the file just edited to ensure no secrets were added."
          }
        ]
      }
    ]
  }
}
```

**Note**: This can be intrusive for rapid development. Recommend using manual `/prepare-commit` instead.

## Best Practices

### When to Review

- ✅ Before every commit
- ✅ After implementing features
- ✅ After bug fixes
- ✅ During refactoring
- ✅ For security-sensitive code

### When to Skip

- ❌ Never skip on critical/security code
- ⚠️ Can skip suggestions if time-constrained
- ⚠️ Document why warnings skipped

### Review Frequency

- **Individual files**: Use code-reviewer subagent
- **Feature complete**: Use `/prepare-commit`
- **Security changes**: Use `/security-review`
- **Performance critical**: Use `/perf-review`
- **New functionality**: Use `/test-review`

## Tips for Effective Reviews

1. **Run early, run often** - Catch issues before they compound
2. **Fix critical first** - Don't commit with critical issues
3. **Document decisions** - Note why warnings were skipped
4. **Learn from feedback** - Reviews teach best practices
5. **Re-review after fixes** - Major fixes may introduce new issues

## Metrics & Goals

### Test Coverage Targets

- Critical paths: 100%
- Business logic: 90%+
- UI components: 80%+
- Utility functions: 90%+

### Code Quality

- Zero critical issues
- Minimize warnings
- Clean linting
- All tests pass

### Performance

- No N+1 queries
- Proper React optimization
- Efficient algorithms
- Fast page loads

## Support & Customization

### Adding New Checks

1. Create skill in `.agent/skills/`
2. Update `/prepare-commit` to include it
3. Add to this documentation

### Modifying Reviewers

- Edit `.agent/subagents/code-reviewer.md`
- Update individual skills in `.agent/skills/`
- Customize for project needs

### Feedback

If reviews are too strict/lenient:

1. Update reviewer prompts
2. Adjust priority levels
3. Modify checklists

---

**Built with**: Claude Code best practices
**Maintained by**: Project team
**Updated**: 2026-02-14
