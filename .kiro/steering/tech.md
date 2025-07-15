# Technology Stack

## Core Technologies

- **Runtime**: Node.js 24+ (ESM modules)
- **Language**: TypeScript with strict configuration
- **Framework**: Express.js 5.x
- **Database**: PostgreSQL with Kysely query builder
- **Validation**: Zod for runtime type validation
- **Testing**: Vitest with Testcontainers for integration tests

## Development Tools

- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier
- **Type Checking**: TypeScript compiler with strict mode
- **Development**: Nodemon for hot reloading
- **Containerization**: Docker with multi-stage builds

## Build System & Commands

### Development

```bash
npm run dev          # Start development server with hot reload
npm run type-check   # Run TypeScript type checking
```

### Building & Production

```bash
npm run build        # Compile TypeScript to dist/
npm start           # Run production build
```

### Testing

```bash
npm test            # Run test suite
npm run test:watch  # Run tests in watch mode
```

### Code Quality

```bash
npm run lint        # Run ESLint
npm run format      # Format code with Prettier
npm run format:check # Check formatting without changes
```

### Docker

```bash
docker-compose up   # Start development environment
```

## Architecture Patterns

- **Repository Pattern**: Data access abstraction with Kysely
- **Service Layer**: Business logic separation from controllers
- **Middleware Pattern**: Authentication and error handling
- **Factory Pattern**: Application creation and configuration
- **Validation Schemas**: Zod schemas for request/response validation

## Code Standards

- ESM modules only (`"type": "module"`)
- Strict TypeScript configuration
- File extensions required in imports (`.js` for compiled output)
- Explicit return types preferred
- No unused variables/parameters (prefix with `_` if needed)
- Console statements should be warnings (use proper logging in production)
