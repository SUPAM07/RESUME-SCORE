README for the secrets/ directory.

Files in this directory are TEMPLATES only.
Copy secrets.env.example → secrets.env and populate with real values.

The actual secrets.env file is listed in .gitignore and must never be
committed.  Use your organisation's secrets-management system (Vault,
AWS Secrets Manager, K8s Secrets, etc.) in production deployments.
