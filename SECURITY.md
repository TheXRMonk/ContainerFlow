# Security Policy

## Supported Versions

Only the latest tagged release receives security updates. ContainerFlow is in early development (`v0.x`), so always pin a specific version in production.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report them privately by email:

📧 **alteonx.servicios@gmail.com**

Include in your report:

- A description of the vulnerability
- Steps to reproduce (or a proof-of-concept)
- Affected version(s)
- Suggested fix if you have one

You can expect:

- **Acknowledgement** within 72 hours
- **Status update** within 7 days
- **Patch + public disclosure** coordinated with you

## Scope

ContainerFlow has access to the Docker socket and host filesystem (read-only). Issues we consider in-scope:

- Privilege escalation beyond what the Docker socket already grants
- Unauthorized access bypassing `AUTH_TOKEN`
- Command injection via container names, env vars, or labels
- Path traversal in compose file resolution
- XSS / CSRF in the web UI
- Denial of service in the backend (memory leaks, infinite loops)

Out of scope:

- Vulnerabilities in dependencies — please report upstream
- Issues requiring physical access to the host
- Social engineering of operators
- Anything you can already do as the Docker daemon user (since you have `docker.sock`)

## Responsible Disclosure

We follow [CVD principles](https://www.first.org/global/sigs/vulnerability-coordination/multiparty/guidelines-v1.1). Public disclosure happens after a fix is released, with credit to the reporter (unless you prefer to remain anonymous).
