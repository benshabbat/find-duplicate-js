# TypeScript Support - Find Duplicate JS

## Overview

Version 1.4.0 of Find Duplicate JS adds full TypeScript support! The tool now identifies and analyzes `.ts` and `.tsx` files in addition to JavaScript files.

## Supported Features

### ✅ File Types
- `.js` - JavaScript
- `.jsx` - JavaScript with JSX
- `.ts` - TypeScript
- `.tsx` - TypeScript with JSX

### ✅ TypeScript Features Supported

1. **Type Annotations**
   ```typescript
   function greet(name: string): string {
     return `Hello, ${name}`;
   }
   ```

2. **Generic Types**
   ```typescript
   function identity<T>(arg: T): T {
     return arg;
   }
   ```

3. **Interfaces & Type Aliases**
   ```typescript
   interface User {
     id: number;
     name: string;
   }
   
   type UserID = string | number;
   ```

4. **Access Modifiers**
   ```typescript
   class Person {
     public name: string;
     private age: number;
     protected id: string;
   }
   ```

5. **Optional Parameters**
   ```typescript
   function buildName(first: string, last?: string): string {
     return last ? `${first} ${last}` : first;
   }
   ```

## How It Works

The tool normalizes code by removing all TypeScript type information, allowing it to detect duplicate code regardless of whether it's written in JavaScript or TypeScript.

### Example

```typescript
// TypeScript
function calculateSum(a: number, b: number): number {
  const result = a + b;
  return result;
}

// JavaScript
function addNumbers(x, y) {
  const total = x + y;
  return total;
}

// Both functions will be detected as duplicates! ✅
```

## Usage

```bash
# Analyze a mixed JS/TS project
find-duplicate ./src

# With web UI
find-duplicate --ui ./src

# With custom similarity threshold
find-duplicate ./src 80
```

## Benefits

- 🔍 **Cross-Language Detection** - Detects duplicate code between JavaScript and TypeScript
- 🎯 **High Accuracy** - Ignores type information and focuses on logic
- ⚡ **Fast Performance** - Efficiently scans large projects
- 🔧 **Zero Configuration** - Works immediately with default settings

## Examples

### Finding Duplicates in a TypeScript Project

```bash
cd my-typescript-project
find-duplicate ./src
```

### Sample Output

```
🔍 Scanning 25 JavaScript/TypeScript files...
📊 Found 85 functions total
⚠️  Found 12 pairs of similar functions

📋 Match #1 - Similarity: 95.5%
   File 1: src/utils/math.ts
   Function: calculateTotal(val1: number, val2: number): number
   
   File 2: src/services/calculator.ts
   Function: sum(a: number, b: number): number
```

## Known Issues

- TypeScript decorators are not yet fully supported
- Enum declarations may create false positives in some cases

## Contributing

Found a bug or have an idea for improvement? Open an issue on GitHub!

## License

MIT License - See LICENSE for more details.
