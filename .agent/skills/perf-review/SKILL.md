---
name: perf-review
description: Performance-focused code review to identify bottlenecks and optimization opportunities.
---

# Performance Review Skill

Analyze code changes for performance issues and optimization opportunities.

## What This Does

1. Reviews `git diff` for performance-impacting changes
2. Identifies common performance anti-patterns
3. Checks database query efficiency
4. Reviews React rendering optimization
5. Validates Next.js best practices

## Performance Checklist

### Database Performance

- [ ] No N+1 query problems (use `include` with Prisma)
- [ ] Appropriate indexes on frequently queried columns
- [ ] Efficient use of `select` to limit fields returned
- [ ] Pagination for large result sets
- [ ] Avoid fetching unnecessary related data

### React/Next.js Performance

- [ ] Server Components used where possible (default in App Router)
- [ ] Client Components only when needed (interactivity, hooks)
- [ ] Proper use of `'use client'` directive
- [ ] Memoization where appropriate (useMemo, useCallback)
- [ ] No unnecessary re-renders
- [ ] Keys on list items are stable and unique

### Asset Optimization

- [ ] Images use next/image component
- [ ] Lazy loading for heavy components
- [ ] Code splitting where beneficial
- [ ] CSS modules for scoped styles

### API & Network

- [ ] API routes return minimal data needed
- [ ] Caching headers set appropriately
- [ ] Parallel requests where possible (Promise.all)
- [ ] Debouncing/throttling on frequent operations

### Algorithm Efficiency

- [ ] O(n²) or worse algorithms avoided where possible
- [ ] Unnecessary loops eliminated
- [ ] Data structures chosen appropriately
- [ ] Early returns/exits to avoid unnecessary work

## Common Performance Issues

### ❌ N+1 Query Problem

```typescript
// BAD: Separate query for each registration
for (const reg of registrations) {
  const user = await prisma.user.findUnique({ where: { id: reg.userId } })
}

// GOOD: Include in single query
const registrations = await prisma.registration.findMany({
  include: { user: true },
})
```

### ❌ Unnecessary Client Component

```typescript
// BAD: Makes entire page client-side
'use client'
export default function Page() {
  return <div>Static content</div>
}

// GOOD: Server component by default
export default function Page() {
  return <div>Static content</div>
}
```

### ❌ Missing Memoization

```typescript
// BAD: Recreates function on every render
function Component({ data }) {
  const processData = () => { /* expensive */ }
  return <Child onProcess={processData} />
}

// GOOD: Memoized callback
function Component({ data }) {
  const processData = useCallback(() => { /* expensive */ }, [])
  return <Child onProcess={processData} />
}
```

## How to Use

Run this skill before committing changes that:

- Modify database queries
- Add new API routes
- Change React component structure
- Process large datasets
- Implement new algorithms

## Expected Output

Performance review will provide:

- **Critical bottlenecks** requiring immediate fix
- **Performance warnings** to address
- **Optimization suggestions** to consider
- **Benchmarks** if performance critical

## After Review

1. Fix critical bottlenecks
2. Implement high-impact optimizations
3. Document intentional trade-offs
4. Consider profiling for complex changes
5. Re-run performance review if major fixes made
