# Context Glossary

Domain language for Petra Pinterest. Terms meaningful to domain experts, not implementation detail.

## AI Disclosure

Pinterest requires creators to disclose AI involvement in a Pin. Sent on `POST /v5/pins` (and pin update) via the `ai_disclosures` object.

API shape:

```jsonc
"ai_disclosures": { "values": ["AI_MODIFIED", "SYNTHETIC_PERFORMER"] }
```

- `ai_disclosures.values` - array, holds zero or more disclosure labels.
- Enum strings are UPPERCASE for the Pin API (`AI_MODIFIED`, `SYNTHETIC_PERFORMER`). Note: the Catalog API uses lowercase (`ai_modified`, `synthetic_performer`) - different surface, do not mix.
- The whole field is optional in the OpenAPI schema. Mandatory by Pinterest *policy* for AI content, not enforced by the API.

### AI_MODIFIED

Image was generated OR altered with AI. Broad. Pinterest's own auto-applied "AI modified" badge fires when their detection sees AI generation/modification on a non-promoted image Pin. This is the general "this is AI" flag.

In this project: every published image goes through AI generation, so `AI_MODIFIED` applies to essentially every Pin. Project default = on.

### SYNTHETIC_PERFORMER

A fully AI-invented **human performer**: a person who looks real but does not exist and is not a copy of any identifiable real human. Narrow. The term derives from synthetic-performer legislation (e.g. NY S.8420-A).

Decision rule for people shown in a Pin:

| Pin shows | AI_MODIFIED | SYNTHETIC_PERFORMER |
|---|---|---|
| AI landscape / graphic / text, no people | yes | no |
| Real photo of a real person, AI-edited | yes | no (person is real) |
| AI-generated invented person (no real basis) | yes | yes |
| AI deepfake of a real identifiable person | yes | no - this is a "digital replica" category with no Pinterest API value, and likely a Community Guidelines violation; avoid |

Core: SYNTHETIC_PERFORMER only when the person is AI-made AND fictional. Real person = never synthetic, even if AI-edited. No person = never synthetic.
