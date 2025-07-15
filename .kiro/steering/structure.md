# Project Structure

## Root Directory

```
├── src/                 # Source code
├── tests/              # Test files (mirrors src structure)
├── dist/               # Compiled TypeScript output
├── .kiro/              # Kiro configuration and specs
├── node_modules/       # Dependencies
└── docker-compose.yml  # Development environment
```

## Source Code Organization (`src/`)

```
src/
├── index.ts           # Application entry point
├── app.ts             # Express app factory
├── config/            # Configuration modules
│   └── env.ts         # Environment validation with Zod
└── routes/            # API route handlers
```

## Test Organization (`tests/`)

- Tests mirror the `src/` directory structure
- Unit tests: `*.test.ts` files alongside source
- Integration tests: Use Testcontainers for database testing
- Test configuration: `vitest.config.ts`

## Configuration Files

- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript compiler configuration
- `eslint.config.js` - ESLint rules (flat config format)
- `.prettierrc` - Code formatting rules
- `vitest.config.ts` - Test runner configuration
- `nodemon.json` - Development server configuration
- `Dockerfile` - Multi-stage container build
- `.env.example` - Environment variable template

## Naming Conventions

- **Files**: kebab-case for config files, camelCase for TypeScript files
- **Directories**: lowercase, descriptive names
- **Imports**: Use `.js` extension for compiled output compatibility
- **Environment**: UPPER_SNAKE_CASE for environment variables
- **Types**: PascalCase for interfaces and types

## Import Patterns

- Relative imports with explicit `.js` extensions
- Barrel exports from index files where appropriate
- Group imports: external libraries first, then internal modules
- Use named exports over default exports for better tree-shaking

## Database & Repository Structure

- Repository pattern for data access
- Service layer for business logic
- Kysely for type-safe SQL queries
- Zod schemas for validation at API boundaries
