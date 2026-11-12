"use client";

import { ArrowLeft, CircleCheck, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { type GroupDetail, type PaymentMethod, getGroup, updateRules } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { groupHref, isOrganizer } from "@/lib/groups";
import { type Errors, MAX_PAYMENTS, METHOD_LABEL, POTS, type SettingsForm, changesFrom, toForm } from "@/lib/settings";

const POT_LABEL = { weekly: "Weekly pot", yearly: "Yearly pot", death: "Death pool, per entry" };

export function GroupSettings() {
  const id = useSearchParams().get("id") ?? "";
  const fetcher = useCallback(() => getGroup(id), [id]);
  const { load, retry, setData } = useLoad(fetcher);
  const [notice, setNotice] = useState<string | null>(null);

  function saved(detail: GroupDetail, effectiveWeek: number) {
    setData(detail);
    setNotice(`Saved. Applies from Week ${effectiveWeek}.`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" aria-busy={load.status === "loading"}>
      <Link href={groupHref(id)} className="chalk inline-flex min-h-11 items-center gap-1.5 text-sm tracking-[0.14em] hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to group
      </Link>
      <h1 className="paint worn mt-1 text-5xl leading-none sm:text-6xl">Settings</h1>
      {load.status === "loading" && <span className="mt-6 block h-64 animate-pulse rounded-xl bg-card/70" />}
      {load.status === "error" && (
        <div className="mt-6">
          <LoadError title="Couldn't load settings" message={load.message} onRetry={retry} />
        </div>
      )}
      {load.status === "ready" && !isOrganizer(load.data.role) && (
        <p className="panel mt-6 p-4 text-muted-foreground">Only the group&apos;s owner or an admin can change settings.</p>
      )}
      {load.status === "ready" && isOrganizer(load.data.role) && (
        <>
          {notice && (
            <p role="status" className="mt-6 flex items-center gap-2 rounded-lg border border-correct/40 bg-correct-muted p-3">
              <CircleCheck className="size-5 shrink-0 text-correct" aria-hidden="true" />
              {notice}
            </p>
          )}
          {/* Keyed on the version so a save re-seeds the form from what the server stored. */}
          <SettingsEditor
            key={load.data.rulesVersion}
            detail={load.data}
            onSaved={saved}
            onEdit={() => setNotice(null)}
          />
        </>
      )}
    </div>
  );
}

interface EditorProps {
  detail: GroupDetail;
  onSaved: (detail: GroupDetail, effectiveWeek: number) => void;
  onEdit: () => void;
}

function SettingsEditor({ detail, onSaved, onEdit }: EditorProps) {
  const [form, setForm] = useState<SettingsForm>(() => toForm(detail.rules));
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<{ kind: "idle" | "saving" } | { kind: "saved" | "failed"; message: string }>({
    kind: "idle",
  });
  const update = (patch: Partial<SettingsForm>) => {
    onEdit();
    setForm((f) => ({ ...f, ...patch }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    const result = changesFrom(form, detail.rules);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!Object.keys(result.changes).length) {
      setStatus({ kind: "saved", message: "Nothing changed." });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const saved = await updateRules(detail.group.groupId, result.changes);
      onSaved({ ...detail, rules: saved.rules, rulesVersion: saved.version }, saved.effectiveWeek);
    } catch (err) {
      setStatus({ kind: "failed", message: err instanceof Error ? err.message : "Could not save settings." });
    }
  }

  const setPayment = (i: number, patch: Partial<SettingsForm["payments"][number]>) =>
    update({ payments: form.payments.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <form onSubmit={save} noValidate className="mt-6 space-y-6">
      {detail.rulesVersion > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-card/85 px-3 py-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-correct" aria-hidden="true" />
          Version {detail.rulesVersion}. Changes apply from the next week that hasn&apos;t locked.
        </p>
      )}

      <Section title="Scoring">
        <Field label="Tied NFL game, pick-em">
          <Select value={form.pickemTie} onChange={(e) => update({ pickemTie: e.target.value as SettingsForm["pickemTie"] })}>
            <option value="zero">0 points for everyone</option>
            <option value="full">Full confidence for everyone</option>
          </Select>
        </Field>
        <Field label="Tied NFL game, death pool">
          <Select value={form.deathTie} onChange={(e) => update({ deathTie: e.target.value as SettingsForm["deathTie"] })}>
            <option value="loss">Counts as a loss</option>
            <option value="win">Counts as a win</option>
          </Select>
        </Field>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={form.deathSecondLife}
            onChange={(e) => update({ deathSecondLife: e.target.checked })}
            className="mt-1 size-5 accent-primary"
          />
          <span>
            <span className="block font-medium">Death pool second life</span>
            <span className="text-sm text-muted-foreground">Each entry survives one loss. Only changeable before Week 1 locks.</span>
          </span>
        </label>
        <div>
          <p className="text-sm font-medium">Pick lock</p>
          <p className="text-muted-foreground">Kickoff of the week&apos;s first game, for picks and the death pool.</p>
        </div>
      </Section>

      <Section title="Fees" hint="Whole dollars. Weekly-only members pay the weekly fee; season members pay weekly and yearly.">
        <div className="grid gap-4 sm:grid-cols-3">
          {POTS.map((pot) => (
            <Field key={pot} label={POT_LABEL[pot]} error={errors[`fees.${pot}`]}>
              <Input
                inputMode="numeric"
                value={form.fees[pot]}
                aria-invalid={Boolean(errors[`fees.${pot}`])}
                onChange={(e) => update({ fees: { ...form.fees, [pot]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Pot splits" hint="Percent of each pot by finishing place, separated by commas. 60, 30, 10 pays the top three.">
        <div className="grid gap-4 sm:grid-cols-3">
          {POTS.map((pot) => (
            <Field key={pot} label={POT_LABEL[pot].replace(", per entry", "")} error={errors[`potSplits.${pot}`]}>
              <Input
                inputMode="numeric"
                value={form.potSplits[pot]}
                aria-invalid={Boolean(errors[`potSplits.${pot}`])}
                onChange={(e) => update({ potSplits: { ...form.potSplits, [pot]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Payment methods" hint="Shown to members on the ledger. The app never moves money.">
        {form.payments.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-2 sm:grid-cols-[8rem_1fr_auto]">
            <Select
              className="col-span-2 sm:col-span-1"
              aria-label={`Method ${i + 1}`}
              value={p.method}
              onChange={(e) => setPayment(i, { method: e.target.value as PaymentMethod })}
            >
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <div>
              <Input
                aria-label={`Handle ${i + 1}`}
                placeholder={p.method === "other" ? "Method and handle" : "Handle, email or phone"}
                value={p.handle}
                aria-invalid={Boolean(errors[`payments.${i}`])}
                onChange={(e) => setPayment(i, { handle: e.target.value })}
              />
              {errors[`payments.${i}`] && <p className="mt-1 text-sm text-wrong">{errors[`payments.${i}`]}</p>}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="size-11 px-0"
              onClick={() => update({ payments: form.payments.filter((_, j) => j !== i) })}
            >
              <Trash2 aria-hidden="true" />
              <span className="sr-only">Remove method {i + 1}</span>
            </Button>
          </div>
        ))}
        {form.payments.length < MAX_PAYMENTS && (
          <Button
            type="button"
            variant="outline"
            onClick={() => update({ payments: [...form.payments, { method: "venmo", handle: "" }] })}
          >
            <Plus aria-hidden="true" />
            Add payment method
          </Button>
        )}
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t-2 border-primary bg-board px-4 py-3 sm:static sm:border-t-0 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="mb-2 text-wrong">
            Fix the highlighted fields.
          </p>
        )}
        {(status.kind === "saved" || status.kind === "failed") && (
          <p role="status" className={status.kind === "failed" ? "mb-2 text-wrong" : "mb-2 text-muted-foreground"}>
            {status.message}
          </p>
        )}
        <Button type="submit" className="w-full sm:w-auto" disabled={status.kind === "saving"}>
          {status.kind === "saving" && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 panel p-5">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="font-display text-2xl font-extrabold uppercase">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
      {error && <span className="font-normal text-wrong">{error}</span>}
    </label>
  );
}
