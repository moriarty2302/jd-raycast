import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  Image,
  Keyboard,
  launchCommand,
  LaunchType,
  List,
} from "@raycast/api";
import { useCachedPromise, useCachedState, useLocalStorage } from "@raycast/utils";
import path from "node:path";
import { useMemo, useState } from "react";
import { collectAll, type CollectResult, type Entry } from "./lib/collect.ts";
import { readSystems, resolveConfigPath, type ConfigSource } from "./lib/config.ts";
import { findJd, jdPaths } from "./lib/jd.ts";
import type { Kind } from "./lib/names.ts";
import { displayKey, entryId, search } from "./lib/query.ts";

interface Preferences {
  jdConfigPath?: string;
  jdPath?: string;
}

const ALL = "all";
const RECENT_LIMIT = 15;

type Loaded = CollectResult & {
  systems: string[];
  noVault: string[];
  // Systems set up for `jd new wp`.
  wpSystems: string[];
  configPath: string;
  configSource: ConfigSource;
};

// Read every system jd knows about. useCachedPromise shows the last list
// instantly and swaps in the fresh one when this returns.
async function load(setting: string, jdSetting: string): Promise<Loaded> {
  const config = await resolveConfigPath({ setting, jd: findJd(jdSetting || undefined), ask: jdPaths });
  let systems;
  try {
    systems = readSystems(config.path);
  } catch (e) {
    throw new Error(`${config.path} (from ${config.source}): ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    configPath: config.path,
    configSource: config.source,
    ...collectAll(systems),
    systems: systems.map((s) => s.sys),
    noVault: systems.filter((s) => !s.jdex).map((s) => s.sys),
    wpSystems: systems.filter((s) => s.workPackages).map((s) => s.sys),
  };
}

export default function Command() {
  const { jdConfigPath, jdPath } = getPreferenceValues<Preferences>();

  const [text, setText] = useState("");
  const [system, setSystem] = useCachedState<string>("system", ALL);
  const { data, isLoading, error } = useCachedPromise(load, [jdConfigPath ?? "", jdPath ?? ""], {
    keepPreviousData: true,
  });
  const { value: recents = [], setValue: setRecents } = useLocalStorage<string[]>("recents", []);

  const entries = useMemo(
    () => (data?.entries ?? []).filter((e) => system === ALL || e.sys === system),
    [data, system],
  );

  const results = useMemo(() => search(entries, text), [entries, text]);

  const recentEntries = useMemo(() => {
    if (text.trim()) return [];
    const byId = new Map(entries.map((e) => [entryId(e), e]));
    return recents.map((id) => byId.get(id)).filter((e): e is Entry => !!e);
  }, [entries, recents, text]);

  const remember = (e: Entry) => {
    const id = entryId(e);
    setRecents([id, ...recents.filter((r) => r !== id)].slice(0, RECENT_LIMIT));
  };

  const showSys = system === ALL && (data?.systems.length ?? 0) > 1;
  const sysColor = (sys: string) => SYS_COLORS[Math.max(0, data?.systems.indexOf(sys) ?? 0) % SYS_COLORS.length];
  const hasVault = (sys: string) => !data?.noVault?.includes(sys);
  // jd takes a plain AC.ID as a work package's parent.
  const canNewWp = (e: Entry) => e.kind === "id" && !!data?.wpSystems?.includes(e.sys);
  const recentIds = new Set(recentEntries.map(entryId));
  const rest = text.trim() ? results : results.filter((e) => !recentIds.has(entryId(e)));

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      onSearchTextChange={setText}
      searchBarPlaceholder="ID, area or words — 11.12, 11 pass, passport"
      searchBarAccessory={
        <List.Dropdown tooltip="System" value={system} onChange={setSystem}>
          <List.Dropdown.Item title="All systems" value={ALL} />
          {(data?.systems ?? []).map((s) => (
            <List.Dropdown.Item key={s} title={s} value={s} />
          ))}
        </List.Dropdown>
      }
    >
      {error && !data ? (
        <List.EmptyView icon={Icon.Warning} title="Couldn't read jd's config" description={error.message} />
      ) : (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No matches"
          description="Try a number like 11 or fewer words"
        />
      )}
      {recentEntries.length > 0 && (
        <List.Section title="Recent">
          {recentEntries.map((e) => (
            <Row
              key={`r-${entryId(e)}`}
              entry={e}
              sysColor={showSys ? sysColor(e.sys) : undefined}
              hasVault={hasVault(e.sys)}
              newWp={canNewWp(e)}
              onOpen={remember}
            />
          ))}
        </List.Section>
      )}
      <List.Section title={text.trim() ? "Results" : "Everything"} subtitle={String(rest.length)}>
        {rest.map((e) => (
          <Row
            key={entryId(e)}
            entry={e}
            sysColor={showSys ? sysColor(e.sys) : undefined}
            hasVault={hasVault(e.sys)}
            newWp={canNewWp(e)}
            onOpen={remember}
          />
        ))}
      </List.Section>
    </List>
  );
}

const KIND_ICON: Record<Kind, Icon> = {
  area: Icon.Layers,
  category: Icon.Folder,
  header: Icon.Minus,
  zero: Icon.Cog,
  id: Icon.Document,
  extend: Icon.PlusSquare,
  wp: Icon.Hammer,
};

// Slashed document and folder, drawn for this extension (assets/no-*-orange.svg),
// in a light tint of Johnny.Decimal's orange (#f04c00): #F58B59 on light,
// #F8AE8C on dark.
const NO_NOTE: Image.ImageLike = { source: { light: "no-note-orange.svg", dark: "no-note-orange@dark.svg" } };
const NO_FOLDER: Image.ImageLike = { source: { light: "no-folder-orange.svg", dark: "no-folder-orange@dark.svg" } };

const SYS_COLORS = [Color.Blue, Color.Purple, Color.Green, Color.Orange, Color.Magenta];

function Row({
  entry: e,
  sysColor,
  hasVault,
  newWp,
  onOpen,
}: {
  entry: Entry;
  sysColor?: Color;
  hasVault: boolean;
  newWp: boolean;
  onOpen: (e: Entry) => void;
}) {
  const accessories: List.Item.Accessory[] = [];
  if (e.wpFor) accessories.push({ text: e.wpFor, tooltip: `Work package for ${e.wpFor}` });
  if (e.status) accessories.push({ tag: e.status, tooltip: "Status" });
  // Zeros and headers often have only one side by design, so don't flag them.
  const flag = e.kind === "id" || e.kind === "extend" || e.kind === "wp";
  // A filesystem-only system has no notes at all, so a marker would say nothing.
  if (flag && hasVault && !e.notePath) accessories.push({ icon: NO_NOTE, tooltip: "No vault note" });
  if (flag && !e.folderPath) accessories.push({ icon: NO_FOLDER, tooltip: "No filesystem folder" });
  if (sysColor) accessories.push({ tag: { value: e.sys, color: sysColor } });

  const dim = e.kind === "header" || e.kind === "zero";
  return (
    <List.Item
      title={`${displayKey(e)}  ${e.title}`}
      subtitle={e.description}
      icon={{ source: KIND_ICON[e.kind], tintColor: dim ? Color.SecondaryText : undefined }}
      keywords={e.aliases}
      accessories={accessories}
      actions={<Actions entry={e} newWp={newWp} onOpen={onOpen} />}
    />
  );
}

function Actions({ entry: e, newWp, onOpen }: { entry: Entry; newWp: boolean; onOpen: (e: Entry) => void }) {
  const note = e.notePath && (
    <Action.Open
      key="note"
      title="Open Note in Obsidian"
      icon={Icon.Document}
      target={`obsidian://open?path=${encodeURIComponent(e.notePath)}`}
      onOpen={() => onOpen(e)}
    />
  );
  // ⌘ Enter is whatever comes second, so it must always be a Finder action:
  // the folder if there is one, otherwise the note shown in Finder.
  // Without this, an ID with no folder had Copy ID on ⌘ Enter.
  const folder = e.folderPath ? (
    <Action.Open
      key="folder"
      title="Open Folder in Finder"
      icon={Icon.Finder}
      target={e.folderPath}
      application="Finder"
      onOpen={() => onOpen(e)}
    />
  ) : (
    e.notePath && (
      <Action.ShowInFinder key="folder" title="Show Note in Finder" path={e.notePath} onShow={() => onOpen(e)} />
    )
  );
  const wikiTarget = e.notePath && e.kind !== "area" && e.kind !== "category" ? path.basename(e.notePath, ".md") : null;

  return (
    <ActionPanel>
      <ActionPanel.Section>
        {/* Enter opens the note; ⌘ Enter the folder. With only one, it takes Enter. */}
        {note}
        {folder}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy ID" content={e.key} shortcut={Keyboard.Shortcut.Common.Copy} />
        {wikiTarget && (
          <Action.CopyToClipboard
            title="Copy Wikilink"
            content={`[[${wikiTarget}]]`}
            shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
          />
        )}
        {e.folderPath && (
          <Action.Open
            title="Open Folder in Terminal"
            icon={Icon.Terminal}
            target={e.folderPath}
            application="Terminal"
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onOpen={() => onOpen(e)}
          />
        )}
      </ActionPanel.Section>
      {newWp && (
        <ActionPanel.Section>
          <Action
            title={`New Work Package for ${e.key}`}
            icon={Icon.Hammer}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            onAction={() =>
              launchCommand({
                name: "new-work-package",
                type: LaunchType.UserInitiated,
                context: { sys: e.sys, id: e.key },
              })
            }
          />
        </ActionPanel.Section>
      )}
    </ActionPanel>
  );
}
