---
name: Image analysis boundary
description: The durable distinction between user-requested image analysis and archive screenshot display.
---

Explicit camera snapshots, video-call snapshots, and user-uploaded images may be sent for analysis when the user asks for it. Drive screenshots returned by chat-history search are display/evidence-matching artifacts only; they must not be automatically OCR-read or narrated.

**Why:** Automatic archive screenshot analysis previously produced unreliable dates and invented or incorrect message interpretations, while camera and upload analysis are intentional user actions that need Gemini vision.

**How to apply:** Keep the user-action image analysis endpoint separate from the disabled archive screenshot-analysis endpoint. History search may inspect pixels only to match visible date/message evidence, never to expose extracted screenshot text as an answer.