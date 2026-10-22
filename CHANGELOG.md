# JD Tools Changelog

## [1.1.0] - 2026-10-22

### Added

- **New Work Package** command: runs `jd new wp` to make a work package —
  the next W number, its note from the template, its folder and its task
  project. Pick the parent ID, give a title, optionally fill in the
  template's fields.
- Preview before creating (⌘ Enter); create straight away with ⌘ ⇧ Enter
  or ⌥ Enter.
- The form's fields come from the template's `{{?TOKEN}}`s. A token on a
  list line gets a multi-line box, one item per line.
- **New Work Package for this ID** (⌘ N) on IDs in the search, with the
  parent filled in.
- **Folder notes** setting: moves jd's new note into a same-named folder.
- **jd program** setting, for jd installed somewhere unusual.

Only systems with a `workPackages` block in jd's config are offered.
New Work Package needs the jd CLI; search still doesn't.

## [1.0.0] - 2026-10-22

First tagged release: the **Search Johnny.Decimal** command.

- Searches every system in jd's config, across the vault and the
  filesystem, one row per ID; by number, by words, or both, with typos
  tolerated.
- Opens the note in Obsidian or the folder in Finder; copy ID, copy
  wikilink, open in Terminal; recents; per-system dropdown.
- Finds `+` extends, headers and work packages; marks IDs with no note or
  no folder.
- Systems without a vault, and flat JDexes, are supported.
- Asks jd where its config is (`jd paths`).
- Johnny.Decimal logo as the icon, used with permission.
