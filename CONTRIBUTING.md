# Contributing to ASG Pay

Thank you for your interest in contributing to ASG Pay! This document provides guidelines and information about contributing to this project.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ASGCompute-ows-agent-pay.git
   cd ASGCompute-ows-agent-pay
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Run tests** to verify your setup:
   ```bash
   npm test
   ```

## Development Workflow

### Branch Naming

- `feat/description` — new features
- `fix/description` — bug fixes
- `docs/description` — documentation changes
- `refactor/description` — code refactoring

### Before Submitting a PR

1. **Type check**: `npm run typecheck`
2. **Run tests**: `npm test`
3. **Build**: `npm run build`
4. **Verify package**: `npm pack --dry-run`

All four must pass before your PR will be reviewed.

### Adding a New Chain Adapter

ASG Pay is designed to be pluggable. To add a new blockchain:

1. Create `src/adapters/yourchain.ts` implementing the `PaymentAdapter` interface (~40 lines)
2. Add tests in `src/__tests__/yourchain.test.ts`
3. Export from `src/adapters/index.ts` and `src/index.ts`
4. Add the network to the README tables
5. Update `CHANGELOG.md`

See [src/adapters/types.ts](src/adapters/types.ts) for the interface definition.

## Code Style

- **TypeScript strict mode** — no `any` types without explicit justification
- **Functional patterns** — prefer pure functions over side effects
- **Naming** — use descriptive names; no abbreviations
- **Comments** — explain *why*, not *what*

## Testing

```bash
# Run all unit tests (no secrets required)
npm test

# Run tests in watch mode during development
npm run test:watch

# Full suite including live Stripe integration (requires credentials)
STRIPE_SECRET_KEY=sk_test_... npm test
```

All new features must include tests. We target 100% coverage on critical paths (policy engine, protocol detection, payment settlement).

## Reporting Issues

- Use [GitHub Issues](https://github.com/ASGCompute/ASGCompute-ows-agent-pay/issues) for bugs and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)
- Include reproduction steps, expected vs actual behavior, and Node.js version

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
