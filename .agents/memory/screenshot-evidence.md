---
name: Screenshot evidence boundary
description: The product boundary between ordinary image display and explicit screenshot-search evidence matching.
---

Screenshot images are display-only during ordinary chat, attachments, camera, and video interactions. Pixel inspection is allowed only when the user explicitly searches history or screenshots and is used to match visible dates/messages, not to generate an unsolicited transcript.

**Why:** Automatic image reading produced unreliable answers, while date/message matching is useful when the user is actively locating archived evidence.

**How to apply:** Keep the normal image path OCR-free. Route explicit archive searches through the bounded, cached evidence matcher and show the matched image without presenting unverified OCR as chat history.