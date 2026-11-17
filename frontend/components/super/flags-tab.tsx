"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { SectionTitle, Skeleton } from "@/components/super/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useLoad } from "@/lib/api/use-load";
import type { FlagName } from "@/lib/flags";
import { FLAG_INFO, type FlagsView, getSuperFlags, resolve, setSuperFlags } from "@/lib/super";
import { cn } from "@/lib/utils";

const BANNER_MAX = 280;

export function FlagsTab() {
  const fetcher = useCallback(() => getSuperFlags(), []);
  const { load, retry, setData } = useLoad(fetcher);
  if (load.status === "loading") return <Skeleton label="Loading flags" />;
  if (load.status === "error") return <LoadError title="Couldn't load flags" message={load.message} onRetry={retry} />;
  return <FlagsBody view={load.data} onChange={setData} />;
}

type Value = boolean | string | null;

function FlagsBody({ view, onChange }: { view: FlagsView; onChange: (view: FlagsView) => void }) {
  const [groupId, setGroupId] = useState(view.groups[0]?.groupId ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(scope: string, name: FlagName, value: Value) {
    setSaving(`${scope}:${name}`);
    setError(null);
    try {
      const { flags } = await setSuperFlags(scope, { [name]: value });
      onChange(
        scope === "global"
          ? { ...view, global: flags }
          : { ...view, groups: view.groups.map((g) => (g.groupId === scope ? { ...g, flags } : g)) },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that flag.");
    } finally {
      setSaving(null);
    }
  }

  // A global value equal to the default is stored as no override, so the default can change under it later.
  const setGlobal = (name: FlagName, value: boolean) => save("global", name, value === view.defaults[name] ? null : value);
  const group = view.groups.find((g) => g.groupId === groupId);

  return (
    <>
      {error && (
        <p role="alert" className="panel mb-4 flex items-center gap-2 p-4 text-wrong">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <BannerForm
        key={view.global.maintenanceBanner ?? ""}
        current={view.global.maintenanceBanner ?? ""}
        saving={saving === "global:maintenanceBanner"}
        onSave={(text) => save("global", "maintenanceBanner", text || null)}
      />

      {[false, true].map((email) => (
        <section key={String(email)}>
          <SectionTitle>{email ? "Global emails" : "Global features"}</SectionTitle>
          <ul className="panel mt-3 divide-y">
            {FLAG_INFO.filter((f) => !!f.email === email).map((f) => {
              const on = resolve(view, f.name) as boolean;
              return (
                <FlagRow key={f.name} label={f.label} hint={f.hint} note={f.name in view.global ? "Overridden" : "Default"}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${email ? "Email: " : ""}${f.label}`}
                    disabled={saving !== null}
                    onClick={() => setGlobal(f.name, !on)}
                    className={cn(
                      "relative h-8 w-14 shrink-0 rounded-full border outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60",
                      on ? "border-correct bg-correct-muted" : "border-border bg-secondary",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("absolute top-1 size-5.5 rounded-full transition-[left]", on ? "left-7 bg-correct" : "left-1 bg-muted-foreground")}
                    />
                  </button>
                </FlagRow>
              );
            })}
          </ul>
        </section>
      ))}

      <SectionTitle>Per group</SectionTitle>
      {view.groups.length === 0 ? (
        <p className="panel mt-3 p-4 text-muted-foreground">No groups yet.</p>
      ) : (
        <>
          <label className="panel mt-3 grid gap-1.5 p-4 text-sm font-medium">
            Group
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {view.groups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.name}
                </option>
              ))}
            </Select>
          </label>
          <ul className="panel mt-3 divide-y">
            {group &&
              FLAG_INFO.filter((f) => !f.global).map((f) => {
                const stored = group.flags[f.name];
                const inherited = resolve(view, f.name) as boolean;
                const choices: { label: string; value: boolean | null }[] = [
                  { label: `Inherit (${inherited ? "on" : "off"})`, value: null },
                  { label: "On", value: true },
                  { label: "Off", value: false },
                ];
                return (
                  <FlagRow key={f.name} label={`${f.email ? "Email: " : ""}${f.label}`} hint={f.hint}>
                    <div role="radiogroup" aria-label={`${f.label} for ${group.name}`} className="flex shrink-0 rounded-lg border p-0.5">
                      {choices.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          role="radio"
                          aria-checked={(stored ?? null) === c.value}
                          disabled={saving !== null}
                          onClick={() => save(group.groupId, f.name, c.value)}
                          className={cn(
                            "min-h-10 rounded-md px-2.5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60",
                            (stored ?? null) === c.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </FlagRow>
                );
              })}
          </ul>
        </>
      )}
    </>
  );
}

function FlagRow({ label, hint, note, children }: { label: string; hint: string; note?: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <span className="min-w-0 flex-1 basis-48">
        <span className="block font-semibold">{label}</span>
        <span className="text-sm text-muted-foreground">
          {hint}
          {note && <span className="text-xs tracking-wider uppercase"> · {note}</span>}
        </span>
      </span>
      {children}
    </li>
  );
}

function BannerForm({ current, saving, onSave }: { current: string; saving: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(current);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(text.trim());
  }

  return (
    <form onSubmit={submit} className="scoreboard p-4">
      <label className="grid gap-1.5">
        <span className="led text-lg">MAINTENANCE BANNER</span>
        <span className="text-sm text-muted-foreground">Shown under the header on every signed-in page while set.</span>
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={BANNER_MAX} placeholder="Nothing showing" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || text.trim() === current}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Save banner
        </Button>
        {current && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => onSave("")}>
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}
