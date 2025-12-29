# Demo Project

This is a demonstration project to test the duplicate code finder with:

- Multiple directories (src/, lib/)
- Nested folder structure (src/auth/, src/utils/, src/api/, src/services/)
- Various function types:
  - Arrow functions with destructuring
  - Arrow functions with default parameters
  - Async functions
  - Class methods
  - Traditional function declarations
- Intentional duplicates to test detection

## Structure

```
demo-project/
├── src/
│   ├── auth/
│   │   ├── authentication.js
│   │   └── validation.js
│   ├── utils/
│   │   ├── dataProcessor.js
│   │   ├── helpers.js
│   │   └── stringUtils.js
│   ├── api/
│   │   └── handlers.js
│   └── services/
│       └── userService.js
└── lib/
    └── arrayUtils.js
```

## Expected Duplicates

The tool should find several duplicate pairs:
- validateUser ↔ verifyUserCredentials
- mapArray ↔ mapItems ↔ transformItems
- filterArray ↔ filterItems
- reduceArray ↔ sumItems ↔ aggregateResults
- ApiHandler methods ↔ UserService methods
- handleRequest ↔ makeRequest
- trimString ↔ removeSpaces
