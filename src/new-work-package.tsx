import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  Icon,
  LaunchProps,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import fs from "node:fs";
import { useState } from "react";
import { collectSystem, type Entry } from "./lib/collect.ts";
import { readSystems, resolveConfigPath } from "./lib/config.ts";
import { findJd, jdPaths, newWp, type NewWpOk, type NewWpRequest } from "./lib/jd.ts";
import { displayKey } from "./lib/query.ts";
import {
  fieldValues,
  formFields,
  templatePrefixes,
  type FormField,
  previewMarkdown,
  resultMarkdown,
  wrapNote,
  validate,
  wpParents,
} from "./lib/wp.ts";

interface Preferences {
  jdConfigPath?: string;
  jdPath?: string;
  folderNotes?: boolean;
}

// "New WP for this ID" in the search launches this with the parent set.
interface LaunchContext {
  sys?: string;
  id?: string;
}

interface WpSystem {
  sys: string;
  adapter?: string;
  parents: Entry[];
  fields: FormField[];
}

interface Loaded {
  jd: string | null;
  systems: WpSystem[];
}

// Systems with a workPackages block in jd's config, each with its parent
// IDs and its template's fields. The fields come from a dry run, which
// makes nothing; jd lists every token it would have to fill.
async function load(setting: string, jdSetting: string): Promise<Loaded> {
  const jd = findJd(jdSetting || undefined);
  if (!jd) return { jd: null, systems: [] };
  const config = await resolveConfigPath({ setting, jd, ask: jdPaths });
  const out: WpSystem[] = [];
  for (const s of readSystems(config.path).filter((x) => x.workPackages)) {
    const parents = wpParents(collectSystem(s).entries, s.sys);
    let fields: FormField[] = [];
    if (parents.length) {
      const probe = await newWp(jd, { sys: s.sys, id: parents[0].key, title: "Template check", dryRun: true });
      if (probe.ok) fields = formFields(probe.toFill, readPrefixes(probe.template));
    }
    out.push({ sys: s.sys, adapter: s.wpTasks, parents, fields });
  }
  return { jd, systems: out };
}

export default function Command(props: LaunchProps<{ launchContext?: LaunchContext }>) {
  const { jdConfigPath, jdPath } = getPreferenceValues<Preferences>();
  const ctx = props.launchContext ?? {};
  const { data, isLoading, error } = usePromise(load, [jdConfigPath ?? "", jdPath ?? ""]);
  const [sys, setSys] = useState<string | undefined>(ctx.sys);
  // Controlled, so a parent passed in from the search survives the list
  // of IDs arriving after the first render.
  const [parent, setParent] = useState<string | undefined>(ctx.id);
  const [errors, setErrors] = useState<{ parent?: string; title?: string }>({});
  const { push } = useNavigation();

  if (error) return <Detail markdown={`# Couldn't start\n\n${error.message}`} />;
  if (data && !data.jd)
    return (
      <Detail markdown="# jd not found\n\nNew Work Package runs the jd CLI. Install it, or set **jd program** in this extension's settings." />
    );
  if (data && data.systems.length === 0)
    return (
      <Detail markdown="# No system is set up for work packages\n\nAdd a `workPackages` block for a system in jd's config, as jd's README describes, and it will appear here." />
    );

  const current = data?.systems.find((s) => s.sys === sys) ?? data?.systems[0];

  const request = (values: Record<string, unknown>, dryRun: boolean): NewWpRequest | null => {
    if (!data?.jd || !current) return null;
    const input = { parent: values.parent as string, title: values.title as string };
    const errs = validate(input, current.parents);
    setErrors(errs);
    if (errs.parent || errs.title) return null;
    return {
      sys: current.sys,
      id: input.parent,
      title: input.title.trim(),
      fields: fieldValues(values, current.fields),
      tasks: current.adapter ? values.tasks !== false : undefined,
      dryRun,
    };
  };

  const preview = async (values: Form.Values) => {
    const req = request(values, true);
    if (!req || !data?.jd) return;
    const toast = await showToast({ style: Toast.Style.Animated, title: "Asking jd…" });
    const r = await newWp(data.jd, req);
    if (!r.ok) {
      toast.style = Toast.Style.Failure;
      toast.title = "jd wouldn't make it";
      toast.message = r.message;
      return;
    }
    toast.hide();
    push(<Preview jd={data.jd} req={req} dry={r} adapter={current?.adapter} />);
  };

  const createNow = async (values: Form.Values) => {
    const req = request(values, false);
    if (!req || !data?.jd) return;
    const r = await create(data.jd, req);
    if (r) push(<Result made={r} />);
  };

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="New Work Package"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Preview" icon={Icon.Eye} onSubmit={preview} />
          <Action.SubmitForm
            title="Create Now"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
            onSubmit={createNow}
          />
        </ActionPanel>
      }
    >
      {data && data.systems.length > 1 && (
        <Form.Dropdown id="sys" title="System" value={current?.sys} onChange={setSys}>
          {data.systems.map((s) => (
            <Form.Dropdown.Item key={s.sys} value={s.sys} title={s.sys} />
          ))}
        </Form.Dropdown>
      )}
      <Form.Dropdown
        id="parent"
        title="Parent ID"
        value={parent}
        filtering={true}
        error={errors.parent}
        onChange={(v) => {
          setParent(v);
          if (errors.parent) setErrors({ ...errors, parent: undefined });
        }}
        info="The ID this work package is about"
      >
        {(current?.parents ?? []).map((p) => (
          <Form.Dropdown.Item
            key={p.key}
            value={p.key}
            title={`${displayKey(p)}  ${p.title}`}
            keywords={[p.key, ...p.aliases]}
          />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Draft the API pricing FAQ"
        error={errors.title}
        onChange={() => errors.title && setErrors({ ...errors, title: undefined })}
        info="Start with a verb: Draft…, Launch…, Define…"
      />
      {current && current.fields.length > 0 && <Form.Separator />}
      {(current?.fields ?? []).map((f) =>
        // The template decides: a list line ("- {{?SCOPE}}") gets a box with one
        // item per line; anything else ("> {{?OUTCOME}}") is a single line.
        f.multiline ? (
          <Form.TextArea
            key={`${current?.sys}${f.id}`}
            id={f.id}
            title={f.label}
            placeholder={f.placeholder}
            info={`One item per line; each line becomes "${f.prefix.trim()} …"`}
          />
        ) : (
          <Form.TextField key={`${current?.sys}${f.id}`} id={f.id} title={f.label} placeholder={f.placeholder} />
        ),
      )}
      {current?.adapter && (
        <Form.Checkbox id="tasks" label={`Create ${capitalise(current.adapter)} project`} defaultValue={true} />
      )}
    </Form>
  );
}

function Preview({ jd, req, dry, adapter }: { jd: string; req: NewWpRequest; dry: NewWpOk; adapter?: string }) {
  const { push } = useNavigation();
  const [busy, setBusy] = useState(false);
  return (
    <Detail
      navigationTitle="Preview"
      isLoading={busy}
      markdown={previewMarkdown(dry, { tasks: req.tasks !== false, adapter })}
      actions={
        <ActionPanel>
          <Action
            title="Create Work Package"
            icon={Icon.Plus}
            onAction={async () => {
              if (busy) return;
              setBusy(true);
              const r = await create(jd, { ...req, dryRun: false });
              setBusy(false);
              if (r) push(<Result made={r} />);
            }}
          />
        </ActionPanel>
      }
    />
  );
}

interface Made extends NewWpOk {
  extra: string[];
}

function Result({ made }: { made: Made }) {
  return (
    <Detail
      navigationTitle={made.num}
      markdown={resultMarkdown(made, made.extra)}
      actions={
        <ActionPanel>
          <Action.Open
            title="Open Note in Obsidian"
            icon={Icon.Document}
            target={`obsidian://open?path=${encodeURIComponent(made.note)}`}
          />
          <Action.Open title="Open Folder in Finder" icon={Icon.Finder} target={made.folder} application="Finder" />
          {made.tasksUrl && <Action.Open title="Open Task Project" icon={Icon.CheckList} target={made.tasksUrl} />}
          <Action.CopyToClipboard title="Copy W Number" content={made.num} />
        </ActionPanel>
      }
    />
  );
}

// Run jd for real. Returns what it made, or null after showing why not.
// Run jd for real, then (with the folder-notes setting) move its bare note
// into a same-named folder. Returns what it made, or null after showing why
// not.
async function create(jd: string, req: NewWpRequest): Promise<Made | null> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Creating work package…" });
  const r = await newWp(jd, { ...req, dryRun: false });
  if (!r.ok) {
    toast.style = Toast.Style.Failure;
    toast.title = "jd didn't create it";
    toast.message = `${r.code}: ${r.message}`;
    return null;
  }
  const made: Made = { ...r, extra: [] };
  if (getPreferenceValues<Preferences>().folderNotes) {
    try {
      const w = wrapNote(r.note);
      if (w.wrapped) {
        made.note = w.path;
        made.extra.push("Note moved into its own folder (folder notes setting).");
      } else made.extra.push(`Note left where jd put it: ${w.note}.`);
    } catch (e) {
      made.extra.push(`Couldn't move the note into a folder: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  toast.style = Toast.Style.Success;
  toast.title = `Created ${r.num}`;
  return made;
}

// The markers in front of each field in the template, so a multi-line
// answer continues as bullets or quote lines. No template: no markers.
function readPrefixes(template?: string): Record<string, string> {
  if (!template) return {};
  try {
    return templatePrefixes(fs.readFileSync(template, "utf-8"));
  } catch {
    return {};
  }
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
