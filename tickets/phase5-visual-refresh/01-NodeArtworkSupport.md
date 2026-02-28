# 01 — Node Artwork Support

## Summary

Add support for displaying track/album artwork in the graph experience, including ingestion and data model updates where needed.

## Owner

Dev

## Dependencies

- Phase 4 complete

## Parallelizable With

- `01-MonochromeBrightnessHierarchy.md`

## Acceptance Criteria

- [ ] Define artwork fields in shared data contracts (backend + frontend types).
- [ ] Ingestion/build steps populate artwork where available from source APIs, with safe fallbacks when missing.
- [ ] Persist artwork references in storage so graph reloads do not drop images.
- [ ] Graph UI can display node artwork in at least:
  - Detail panel
  - Hover/preview surface (or equivalent compact surface)
- [ ] Missing/broken images degrade gracefully with no UI breakage.
- [ ] Add or update tests covering new artwork fields in pipeline and API responses.
- [ ] Update developer docs to describe artwork behavior and limitations.

## Notes

- This may require schema changes and migration handling.
- Do not block on perfect image quality; prioritize correctness and stable fallback behavior.

