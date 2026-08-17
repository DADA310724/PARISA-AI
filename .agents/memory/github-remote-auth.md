---
name: GitHub remote authentication
description: How GitHub pushes are authenticated from this workspace.
---

The GitHub remote may reject the default credential flow even when `GITHUB_TOKEN` exists as a Replit secret. A secret-backed `GIT_ASKPASS` helper can authenticate the push without printing the token.

**Why:** A normal `git push origin main` returned “Invalid username or token” in this workspace, while the same commit pushed successfully through askpass using the existing secret.

**How to apply:** Never print or embed the token in output. Use a temporary askpass helper that returns `x-access-token` for the username and reads `GITHUB_TOKEN` only for the password, then remove the helper after the push.