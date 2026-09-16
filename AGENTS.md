# WOYA production data

Admin-managed data is the source of truth. Preserve all live product records,
measurement prices, builder prices, categories, content, store settings, uploads,
customer records and orders across code releases.

- Start code revisions from the current production source, not an old local copy.
- Code deployment must never seed, restore, reset, or bulk rewrite production data.
- Do not run catalog:prices, catalog:prices:overwrite, admin:setup, price migration
  scripts, or data restore commands as part of a routine website revision.
- Do not replace admin prices with values from source defaults or test fixtures.
- Run mutation tests only against disposable databases with isolated uploads.
- Before release, take a protected database backup and a read-only snapshot of
  product, category, and content records. Compare them after release. Investigate
  differences; preserve concurrent admin edits and never restore over them.
- Any requested data migration must be minimal, explicitly in scope, backed up,
  tested separately, and preserve every unrelated admin-managed field.
- Rollback changes code only. Never roll production data back with the code.
