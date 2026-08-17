# PARISA AI

## Project overview

PARISA AI is a Bengali-first memory and archive portal. It serves a static chat interface from `public/` and an Express server from `server.js`. The server loads the local `chat_database.json` archive, provides deterministic archive search and exact-row history tables, and uses configured AI/Drive/Telegram services for analysis and supporting features.

## User preferences

- Preserve original archive message text exactly: do not translate, summarize, correct spelling, or truncate it.
- Keep first-contact behavior natural: greet once, explain capabilities, then ask what the user wants to know. Do not repeat the generic welcome sentence for unrelated messages.
- Prefer database records as the source of truth for dates, senders, platforms, files, and chat-history tables.
- Verify the workflow, live API behavior, and GitHub push before reporting completion.