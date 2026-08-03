# Security Policy

Never commit `.env`, Gmail app passwords, `.venv`, or `state.json`.

If a Gmail app password is exposed:
1. Revoke it immediately in the Google account.
2. Generate a new app password.
3. Remove the secret from Git history if it was committed.

Please report security issues privately to the repository owner rather than
opening a public issue.
