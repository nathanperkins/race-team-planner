---
name: test-review
description: Reviews test coverage and quality for code changes, ensuring proper TDD practices.
---

# Test Review Skill

Ensure code changes have proper test coverage following TDD best practices.

## What This Does

1. Analyzes code changes in `git diff`
2. Verifies tests exist for new/modified functionality
3. Reviews test quality and coverage
4. Checks for edge cases and error scenarios
5. Validates TDD workflow was followed

## Test Coverage Checklist

### Test Existence

- [ ] New functionality has corresponding tests
- [ ] Modified code has updated tests
- [ ] Tests written BEFORE implementation (TDD)
- [ ] Tests are in appropriate location (_test.ts or _.test.tsx)

### Test Quality

- [ ] Tests are clear and readable
- [ ] Test names describe what they're testing
- [ ] Tests follow AAA pattern (Arrange, Act, Assert)
- [ ] No overly complex test logic
- [ ] Tests are independent (no shared state)
- [ ] Mocks are used appropriately

### Coverage Completeness

- [ ] Happy path covered
- [ ] Error cases covered
- [ ] Edge cases covered (empty, null, undefined, etc.)
- [ ] Boundary conditions tested
- [ ] Integration points tested

### Project-Specific Testing

- [ ] React components use @testing-library/react
- [ ] Server actions tested with proper mocking
- [ ] Database operations use test database
- [ ] Discord/iRacing APIs properly mocked
- [ ] Tests follow existing patterns in project

## Test Quality Patterns

### ✅ Good Test Structure

```typescript
describe('RaceDetails', () => {
  it('shows red X shield for racer ineligible for the race', () => {
    // Arrange
    const mockRace = {
      registrations: [{ /* test data */ }]
    }

    // Act
    render(<RaceDetails race={mockRace} />)

    // Assert
    expect(screen.getByTestId('shield-icon')).toBeInTheDocument()
  })
})
```

### ❌ Poor Test Structure

```typescript
// BAD: Unclear test name
it('test 1', () => {
  const x = doThing()
  expect(x).toBe(true) // What does this verify?
})
```

### ✅ Testing Edge Cases

```typescript
describe('eligibility check', () => {
  it('returns false when stats are null', () => {
    /* ... */
  })
  it('returns false when stats are undefined', () => {
    /* ... */
  })
  it('returns false when stats array is empty', () => {
    /* ... */
  })
  it('returns true when license meets minimum', () => {
    /* ... */
  })
})
```

## Test Anti-Patterns to Avoid

### ❌ Testing Implementation Details

```typescript
// BAD: Tests internal state
expect(component.state.counter).toBe(5)

// GOOD: Tests user-visible behavior
expect(screen.getByText('Count: 5')).toBeInTheDocument()
```

### ❌ Brittle Tests

```typescript
// BAD: Breaks if CSS changes
expect(element.className).toBe('button-primary')

// GOOD: Tests behavior
expect(button).toHaveAttribute('type', 'submit')
```

### ❌ Dependent Tests

```typescript
// BAD: Tests depend on order
let sharedState
it('test 1', () => {
  sharedState = setup()
})
it('test 2', () => {
  use(sharedState)
})

// GOOD: Independent tests
it('test 1', () => {
  const state = setup() /* ... */
})
it('test 2', () => {
  const state = setup() /* ... */
})
```

## Missing Test Indicators

Review will flag if changes are missing tests for:

1. **New functions/methods** - Should have unit tests
2. **New components** - Should have render tests
3. **New API routes** - Should have integration tests
4. **Modified logic** - Tests should be updated
5. **Bug fixes** - Should have regression test

## How to Use

Run this skill:

- After implementing new features
- Before marking work as complete
- When reviewing pull requests
- If tests are failing

## Expected Output

Test review will provide:

- **Missing tests** that must be added
- **Weak tests** that should be improved
- **Edge cases** to consider testing
- **Test patterns** to follow
- **Coverage report** summary

## After Review

1. Add missing tests (TDD: should be done FIRST)
2. Improve weak test cases
3. Run: `npm test` to verify all pass
4. Run: `npm run format && git hook run pre-commit`
5. Verify coverage is acceptable
6. Commit with confidence

## Coverage Guidelines

Aim for:

- **Critical paths**: 100% coverage
- **Business logic**: 90%+ coverage
- **UI components**: 80%+ coverage
- **Utility functions**: 90%+ coverage

Don't obsess over 100% - focus on testing behavior that matters.
