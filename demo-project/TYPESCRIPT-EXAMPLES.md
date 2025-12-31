# TypeScript Examples in Demo Project

This directory contains TypeScript example files to demonstrate the TypeScript support in Find Duplicate JS.

## Files Added

### 1. `src/utils/mathUtils.ts`
Contains various mathematical utility functions written in TypeScript with:
- Type annotations on parameters and return values
- Generic functions with type parameters (`<T>`)
- Class with access modifiers (`public`, `private`)
- Async functions with Promise types
- Interface definitions

**Intentional Duplicates:**
- `addNumbers()` - Similar to functions in other files
- `sumTwoNumbers()` - Duplicate of `addNumbers()` within the same file
- `calculateSum()` - Generic version of addition

### 2. `src/services/tsUserService.ts`
Contains user service functions in TypeScript with:
- Interface definitions (`User`)
- Type annotations
- Optional parameters
- Type guards
- Generic functions

**Intentional Duplicates:**
- `calculateTotal()` - Duplicate of math functions from `mathUtils.ts`
- `getUserData()` - Similar to `fetchAndCalculate()` from `mathUtils.ts`
- `sumScores()` - Another duplicate of addition functions

## Purpose

These files serve multiple purposes:

1. **Testing TypeScript Support**: Verify that the tool correctly identifies TypeScript files
2. **Cross-Language Duplicate Detection**: Test that duplicates are found between `.js` and `.ts` files
3. **Type Annotation Handling**: Ensure that type information is properly normalized
4. **Real-World Examples**: Provide practical examples of how the tool works with TypeScript

## Running Tests

To see the TypeScript support in action:

```bash
# From the root directory
node find-duplicates.js ./demo-project

# Expected results:
# - Should scan both .js and .ts files
# - Should find duplicates between mathUtils.ts functions
# - Should find duplicates between .ts and .js files
# - Should ignore type annotations when comparing
```

## Expected Duplicates

When running the tool, you should see matches like:

1. **100% Match**: `addNumbers()` (mathUtils.ts) ↔ `sumTwoNumbers()` (mathUtils.ts)
2. **100% Match**: `calculateTotal()` (tsUserService.ts) ↔ `addNumbers()` (mathUtils.ts)
3. **100% Match**: `sumScores()` (tsUserService.ts) ↔ `calculateSum()` (mathUtils.ts)
4. **100% Match**: `getUserData()` (tsUserService.ts) ↔ `fetchAndCalculate()` (mathUtils.ts)

These matches demonstrate that the tool successfully:
- Identifies TypeScript functions
- Normalizes type annotations
- Compares logic rather than syntax
- Detects duplicates across language boundaries
