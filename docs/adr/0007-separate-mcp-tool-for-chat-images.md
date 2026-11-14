---
status: accepted
---

# Separate MCP tool for chat images, image upload guide as resource and tool

Images from a ChatGPT chat (uploaded or generated there) go through their own tool `create_pin_from_chat_image` with a required `image_file` listed in `_meta["openai/fileParams"]`. `create_pin` keeps `image_url`, `upload_path` and `image_base64` and no longer offers `image_file`. Both share one core that stores no image itself and inserts the pin with the same metadata and status rules (ADR-0006: never Gemini, `metadata_created` only with Titel, Beschreibung, Board).

## Why

- Choosing one of four optional image sources on `create_pin` was an error source for the model. One tool per kind of image is easier to pick.
- The Apps SDK example declares the file field top-level and required. Required tells the host it must hydrate the field.
- The intake probe showed ChatGPT sending the string `"chat_upload"` instead of a file object. The SDK validates arguments before the handler and would answer with a bare "expected object, received string". So the file field is parsed leniently (`.catch`): a malformed value becomes an empty file, and the handler answers with an error that says the client did not hand over the file and names the fallbacks (`create_pin` with `image_url`, `request_pin_upload`). The published JSON Schema stays the strict, required file object without `default`; a test pins this, because it relies on how zod renders `.catch`.

## Image upload guide

- One German Markdown text for agents (decision tree, formats and sizes from the code, fallbacks, metadata) in `src/lib/mcp/image-upload-guide.ts`.
- Served three ways: MCP resource `pinfinity://guides/bild-upload` (adds the resources capability), the read tool `get_image_upload_guide` for clients that never read resources (ChatGPT), and a short decision tree in the server `instructions`.

## Considered options

- **Keep `image_file` on `create_pin` (rejected).** See above; also two tools would compete for chat images.
- **Accept `string | object` in the published schema (rejected).** Not spec-conform for `openai/fileParams` and invites the model to fill the field itself.
- **Resource only (rejected).** ChatGPT does not read resources on its own.

## Consequences

- Tools: `create_pin_from_chat_image` and `get_image_upload_guide` are new. Clients with a cached tool list need a refresh.
- Whether ChatGPT hydrates generated images or the mobile app is still unverified. `[mcp] image_intake` now also logs `create_pin_from_chat_image`.
