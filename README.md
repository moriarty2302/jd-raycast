# Raycast extension for Johnny.Decimal (JD)

> Mostly written by Claude. See [AI attribution](#ai-attribution).

A Raycast extension that searches every Johnny.Decimal system the
[jd CLI](https://cli.johnnydecimal.com) ([repo](https://github.com/johnnydecimal/cli.johnnydecimal.com)) knows about, across the vault (JDex)
and the filesystem at once. Type an ID (`11.12`), a category or area
(`11`, `10-19`), a number plus a word (`11 pass`), or just words
(`passport`), and open the note or the folder.

A second command, **New Work Package**, makes a work package by running
[`jd new wp`](https://github.com/johnnydecimal/cli.johnnydecimal.com#jd-new-wp) for you: pick the parent ID, give it a title, optionally fill
in the template's fields, preview, create.

I made this for myself but hope others find it useful. I have two systems and was finding searching with Finder on a Mac annoying. This extension simplifies search for me. Then, leaning on the jd CLI, I wanted making work packages to be simpler too. I'm OK in the Terminal, but I feel more comfortable using something like this. I also use an Obsidian vault with Folder Notes (via the Notebook Navigator plugin) - the native jd CLI app doesn't deal with Folder Notes as a concept (at the time of writing).

A big "thank you" to Johnny.Decimal himself who is so generous with his time and actively encourages this kind of experimentation. Find out more about Johnny Decimal at https://www.johnnydecimal.com/.

Hope you find it useful. It is not in the Raycast Store (yet); install it from this repository.

## Requirements

Needed:

- **macOS and Raycast.** Raycast is Mac-only; the extension also opens
  Finder and Apple's Terminal by name.
- **Node and npm**, once, to build it (`npm install`, `npm run build`).
  Raycast runs the result itself. The probe and tests need Node 22.6+.
- **jd's config file.** The extension asks jd where it is
  ([`jd paths`](https://github.com/johnnydecimal/cli.johnnydecimal.com#where-jd-keeps-its-files));
  without jd it uses `~/.config/johnnydecimal/config.json`, and a path set
  in the extension's settings overrides both. Per system it reads `sys`,
  `root`, `jdex` if present, and whether there is a `workPackages` block.
  Paths must be absolute; `~` is not expanded.

Needed for New Work Package only:

- **[The jd CLI](https://github.com/johnnydecimal/cli.johnnydecimal.com)** (4.1 or later), with `jq`, at jd's usual
  [install location](https://github.com/johnnydecimal/cli.johnnydecimal.com#installation)
  `~/.local/share/johnnydecimal/cli/bin/jd` or wherever the *jd program*
  setting points.
- **A system with a `workPackages` block** in jd's config. Only those
  systems are offered. jd's README describes
  [the block](https://github.com/johnnydecimal/cli.johnnydecimal.com#jd-new-wp) and its [adapters](https://github.com/johnnydecimal/cli.johnnydecimal.com/blob/main/lib/adapters/README.md),
  and the [`W0003` templates](https://github.com/johnnydecimal/cli.johnnydecimal.com#templates).

Not needed:

- **The jd CLI, to search.** Search only reads jd's config file; a
  hand-written config in the same format works.
- **A vault.** A system with no `jdex` is searched from its filesystem
  folders alone: Enter opens the folder, and rows have no descriptions.
- **Obsidian, to search.** The vault is read as plain Markdown. Obsidian is
  only needed for Enter → open note, which uses an `obsidian://` link and
  works once the vault has been opened in Obsidian.

Folder and note conventions it expects:

- Names in JD notation: `10-19 Name`, `11 Name`, `11.12 Name`,
  `11.16+ABC Name`, `14.22+ Name`, `W0010~34.11 Name` (optional trailing
  `@status` on the filesystem).
- Filesystem: area → category → ID folders; `+` extends as subfolders
  inside their base ID (`11.16 …/+ABC …`); work packages in a
  `W0000-W9999 …` folder at the root.
- Vault: ID notes inside area/category folders, either as folder notes
  (`11.12 Name/11.12 Name.md`) or loose in the category. A flat JDex, with
  the ID notes in the vault root, also works.
- Descriptions are the first `>` line of an ID note; aliases come from
  `aliases:` in its frontmatter. Both are optional.

## macOS permissions

**Search needs no special permission.** It reads your vault and filesystem
folders, which Raycast can already reach if they are in places like
Documents or iCloud Drive (System Settings → Privacy & Security → Files &
Folders → Raycast).

**New Work Package** runs `jd new wp`. With the Things
adapter, jd reads the Things database to refresh its snapshot of the
template project. From Raycast that needs one extra switch:

> System Settings → Privacy & Security → Files & Folders → Raycast →
> **Data shared by Things and affiliated apps**

Without it, jd still creates the work package from the snapshot it last
saved in `W0003`, and warns that the refresh failed. Turn it on only if you
want template edits made in Things to be picked up automatically;
otherwise run `jd new wp --refresh` in Terminal after editing the template.

## Install

1. Check you have the requirements above: Raycast, Node and npm
   (`node -v` should print v22 or later), and a jd config file.
2. Get the code and build it:

   ```bash
   git clone https://github.com/moriarty2302/jd-raycast.git
   cd jd-raycast
   npm install
   npm run build
   ```

3. In Raycast, run **Import Extension** and choose the `jd-raycast` folder.
4. Build once more, because the import can leave out the compiled command
   (Raycast would then say "Missing executable"):

   ```bash
   npm run build
   ```

5. Open Raycast and run **Search Johnny.Decimal** or **New Work
   Package**. To call them up quickly, give each an alias (e.g. `jd`,
   `wp`) or a hotkey in Raycast Settings → Extensions → JD Tools.

Settings, in the same pane (select JD Tools itself):

| Setting | Default | Use |
|---|---|---|
| jd config file | blank: ask jd | a config somewhere jd doesn't know about |
| jd program | blank: `~/.local/share/johnnydecimal/cli/bin/jd` | jd installed somewhere else |
| Folder notes | off | your vault keeps each note in a same-named folder (see below) |

When a new version adds a command, run **Import Extension** again, then
`npm run build` again.

### Update

```bash
cd jd-raycast
git pull
npm install
npm run build
```

Reopen the command in Raycast to pick up the new version.

### Uninstall

In Raycast Settings → Extensions, select JD Tools and choose Uninstall
Extension. Then delete the `jd-raycast` folder. Nothing else is installed.
Work packages you made stay where jd put them.

## Using it

| Type | You get |
|---|---|
| nothing | recently opened IDs, then everything in ID order |
| `11`, `11.1`, `10-19`, `W0` | that category, area or range, in ID order |
| `34.11` | that ID and the work packages that belong to it |
| `11 pass` | IDs in 11 matching "pass" |
| `passport`, `pasport` | best matches across everything, typos allowed |

| Key | Action |
|---|---|
| Enter | open the note in Obsidian (the folder, if there is no note) |
| ⌘ Enter | open the folder in Finder (or show the note, if there is no folder) |
| ⌘ ⇧ C | copy the ID |
| ⌘ ⇧ L | copy a `[[wikilink]]` to the note |
| ⌘ T | open the folder in Terminal |
| ⌘ N | new work package for this ID (systems set up for work packages) |

The dropdown in the search bar switches between all systems and one. A light-orange
document or folder with a slash through it means the ID has no vault note
or no filesystem folder; hover over it for which. These icons are drawn
for this extension (`assets/no-*-orange.svg`).

## New Work Package

Start it on its own, or with **⌘ N** on an ID in the search, which fills
in the parent.

| Field | |
|---|---|
| System | only if more than one system has a `workPackages` block |
| Parent ID | required; searchable; plain IDs only (`21.25`), as jd requires |
| Title | required; tip: start with a verb |
| Template fields | optional; one per `{{?TOKEN}}` in your `Work package template.md` (e.g. Outcome, Scope, Deliverable). Left blank, jd uses the template's prompt text. **The template decides the box:** a token on a list line (`- {{?SCOPE}}`, `1. {{?STEP}}`, `> - {{?OUTCOME}}`) gets a multi-line box, and each line you type becomes another item; any other line (`> {{?OUTCOME}}`, `Owner: {{?OWNER}}`) gets a one-line field |
| Create Things project | shown when the system has a task adapter; on by default |

- **⌘ Enter → Preview** (plain Enter too, from any one-line field; in a multi-line field Enter starts a new line instead). jd's dry run: the next W number, the note and
  folder it will make, the task project, and which fields stay as prompt
  text. Nothing is made. Then **Create Work Package**.
- **⌘ ⇧ Enter or ⌥ Enter → Create now**, without the preview. ⌥ Enter is Raycast's own shortcut for a form's second action.
- After creating: open the note in Obsidian, the folder in Finder, or the
  task project.

jd does the work: numbering, the note from the template, the folder, the
Things project (see jd's [`jd new wp`](https://github.com/johnnydecimal/cli.johnnydecimal.com#jd-new-wp) and
[Templates](https://github.com/johnnydecimal/cli.johnnydecimal.com#templates)). The extension copies none of that logic, so it follows
jd's rules and templates, including fields you add to the template later.
If jd refuses (for example, a folder with the next number already exists),
its message is shown and nothing is made. The extension reads jd's `--json`
answers and matches on their `code`, as jd's
[For agents](https://github.com/johnnydecimal/cli.johnnydecimal.com#for-agents) section asks.

**Folder notes.** jd makes a bare note (`W0033~21.25 Title.md`). With the
*Folder notes* setting on, the extension then moves it into a folder of
the same name (`W0033~21.25 Title/W0033~21.25 Title.md`). It never
overwrites a note, and says on the result screen if it left one where it
was.

## How it finds things

- **Systems** come from jd's config (`sys`, `root`, `jdex`), found as
  described under Requirements. Nothing to set up here; a new jd system
  shows up on its own. The config is only read, never written.
- **Vault:** area and category folders, then ID notes, identified by their
  file name (folder notes, or loose notes directly in a category). Aliases
  and the first `>` description line come from the top of each note; both
  the current note format and an older `ID:`/`Title:` one are understood.
- **Filesystem:** area, category and ID folders, `+` extend subfolders
  inside their base ID, and the `W0000-W9999` work-package container.
- Both sides merge into one row per key, so each row knows its note and/or
  its folder.

Search is read-only. New Work Package writes only by running jd, plus the
optional folder-notes move.

## Layout

```
src/lib/config.ts    read jd's config
src/lib/names.ts     parse JD names, sort order (pure)
src/lib/collect.ts   walk vault + filesystem, merge into rows
src/lib/query.ts     parse the search box, filter and rank
src/lib/jd.ts        run the jd CLI, read its --json answers
src/lib/wp.ts        New Work Package helpers: parents, fields, preview, wrap
src/search.tsx       the search command
src/new-work-package.tsx  the New Work Package command
scripts/probe.ts     run the collector on the real systems and report
scripts/try.ts       run searches against the real systems
tests/               unit tests (node:test)
```

The `lib` code has no Raycast dependency and runs on plain Node 22.6+:

```bash
npm run probe            # counts and mismatches for every system
npm run probe -- D25 --list
npm test
```

## Development

```bash
npm run dev      # loads into Raycast with hot reload while it runs
npm run build    # writes the compiled command for Raycast
npm test
```

`npm run build` writes to `~/.config/raycast/extensions/jd-search/`.
Tests never touch real systems: jd is faked, and vaults are built in a
temporary folder. To try `jd new wp` for real without touching your own
systems, point jd at a throwaway config with `JD_CONFIG=/path/config.json`.
`npm run lint` currently fails on the `author` field, which Raycast wants
to be a Raycast Store username; that only matters for publishing.


## Licence

[MIT](LICENSE). Johnny.Decimal is a trademark of Coruscade Pty Ltd; this
is an independent tool for Johnny.Decimal systems and is not endorsed by
Johnny.Decimal.

The extension icon is the Johnny.Decimal logo, used with permission of
Coruscade Pty Ltd. The MIT licence covers this project's code, not the
logo. The [jd CLI](https://github.com/johnnydecimal/cli.johnnydecimal.com) is a separate project, also
[MIT](https://github.com/johnnydecimal/cli.johnnydecimal.com/blob/main/LICENSE).

## AI attribution

- Carl:
  - Designs the extension: decides what it does, how it behaves and what it
    leaves out.
  - Tests it in daily use against his own Johnny.Decimal systems, and
    approves every change before it's committed.
- Claude:
  - Writes the code and the tests.
  - Writes the text in the repository, e.g. this README, which Carl then
    reviews and edits.
