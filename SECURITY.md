# Security Policy

## Supported Versions

| Version | Supported |
|---------|:---------:|
| 0.1.x   | ✅         |
| < 0.1   | ❌         |

## Reporting a Vulnerability

**Do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in ASG Pay, please report it responsibly:

1. **Email**: [security@asgcard.dev](mailto:security@asgcard.dev)
2. **Subject line**: `[SECURITY] ASG Pay — Brief description`
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix development | Within 14 business days |
| Public disclosure | After fix is released |

## Security Model

ASG Pay implements a **fail-closed** security architecture:

- **PolicyEngine** — 4-gate budget controller that rejects all payments by default
- **Per-transaction caps** — hard limits on individual payment amounts
- **Monthly budgets** — rolling spending limits with automatic reset
- **Destination whitelists** — optional address allowlists
- **No credential storage** — private keys are never persisted by the SDK

## Known Limitations

- The SDK trusts the server's 402 challenge — it does not independently verify pricing
- Private keys are held in memory during the adapter lifecycle
- Monthly budget tracking is in-memory and resets on process restart

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Do not exploit the vulnerability beyond what is necessary to demonstrate it
- Do not access or modify other users' data

We appreciate your help in keeping ASG Pay and its users safe.
