---
name: security-review
description: Specialized security review for code changes, focusing on vulnerabilities and data protection.
---

# Security Review Skill

Run a focused security review of code changes before committing.

## What This Does

1. Analyzes `git diff` for security-related changes
2. Checks for common vulnerabilities (OWASP Top 10)
3. Scans for exposed secrets and credentials
4. Reviews authentication and authorization logic
5. Validates input sanitization

## Security Checklist

### Authentication & Authorization

- [ ] Auth checks on protected routes/actions
- [ ] Session validation where required
- [ ] Role-based access control (admin vs. user)
- [ ] No authentication bypass possible

### Data Protection

- [ ] Sensitive data encrypted (passwords, tokens)
- [ ] No secrets in source code (check .env usage)
- [ ] Personal data handled according to privacy requirements
- [ ] Database credentials not exposed

### Input Validation

- [ ] User input validated and sanitized
- [ ] SQL injection prevention (Prisma handles this, but check raw queries)
- [ ] XSS prevention (React escapes by default, but check dangerouslySetInnerHTML)
- [ ] Command injection prevention in Bash executions
- [ ] File upload validation (if applicable)

### API Security

- [ ] CSRF protection on state-changing operations
- [ ] Rate limiting on sensitive endpoints
- [ ] API keys/tokens properly secured
- [ ] External API calls use HTTPS

### Project-Specific Security

- [ ] Discord bot token not exposed
- [ ] iRacing credentials stored in .env
- [ ] NextAuth secret properly configured
- [ ] Database connection string secure
- [ ] Backup encryption key not committed

## How to Use

Run this skill before committing any changes that:

- Handle user authentication
- Process user input
- Access external APIs
- Modify database schemas
- Handle sensitive data

## Expected Output

Security review will provide:

- **Critical vulnerabilities** requiring immediate fix
- **Security warnings** to address before commit
- **Recommendations** for security improvements
- **Confirmation** if no security issues found

## After Review

If critical vulnerabilities found:

1. Fix immediately
2. Re-run security review
3. Run full quality checks
4. Then commit

If only recommendations:

1. Consider implementing improvements
2. Document decision if skipping
3. Proceed with commit
