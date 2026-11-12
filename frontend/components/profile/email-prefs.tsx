"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getEmailPrefs,
  sendTestEmail,
  setEmailPrefs,
  type EmailSettings,
  type EmailType,
} from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { emailTypesFor } from "@/lib/email";

type Group = EmailSettings["groups"][number];

export function EmailPrefs() {
  const { load, retry, setData } = useLoad(getEmailPrefs);

  return (
    <section aria-labelledby="email-heading" className="mt-6 panel p-5">
      <h2 id="email-heading" className="font-display text-2xl font-extrabold uppercase">
        Email settings
      </h2>
      {load.status === "loading" && <p className="mt-2 text-muted-foreground">Loading your email settings</p>}
      {load.status === "error" && (
        <div role="alert" className="mt-2">
          <p className="text-muted-foreground">{load.message}</p>
          <Button variant="outline" className="mt-3" onClick={retry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}
      {load.status === "ready" && (
        <EmailSettingsForm
          settings={load.data}
          onGroup={(group) =>
            setData({ ...load.data, groups: load.data.groups.map((g) => (g.groupId === group.groupId ? group : g)) })
          }
        />
      )}
    </section>
  );
}

function EmailSettingsForm({ settings, onGroup }: { settings: EmailSettings; onGroup: (g: Group) => void }) {
  return (
    <>
      <p className="mt-1 text-muted-foreground">Sent to {settings.address}. Each group has its own settings.</p>
      {settings.suppressed && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-wrong">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          Email to this address bounced or was marked as spam, so nothing more will be sent to it.
        </p>
      )}
      {settings.groups.length === 0 && <p className="mt-4 text-muted-foreground">Join a group to get its email.</p>}
      {settings.groups.map((group) => (
        <GroupPrefs key={group.groupId} group={group} labels={settings.types} onChange={onGroup} />
      ))}
    </>
  );
}

function GroupPrefs({
  group,
  labels,
  onChange,
}: {
  group: Group;
  labels: EmailSettings["types"];
  onChange: (g: Group) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);

  async function toggle(type: EmailType, on: boolean) {
    setError(null);
    onChange({ ...group, prefs: { ...group.prefs, [type]: on } });
    try {
      const saved = await setEmailPrefs(group.groupId, { [type]: on });
      onChange({ ...group, prefs: saved.prefs });
    } catch (err) {
      onChange(group);
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function sendTest() {
    setTest("Sending");
    try {
      const sent = await sendTestEmail(group.groupId);
      setTest(`Sent to ${sent.to}`);
    } catch (err) {
      setTest(err instanceof Error ? err.message : "Could not send.");
    }
  }

  return (
    <fieldset className="mt-5 border-t pt-4">
      <legend className="float-left w-full font-semibold">
        {group.name} <span className="font-normal text-muted-foreground">{group.season}</span>
      </legend>
      <div className="clear-left grid gap-1 pt-2">
        {emailTypesFor(labels, group.role).map((type) => (
          <label key={type} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={group.prefs[type]}
              onChange={(e) => toggle(type, e.target.checked)}
              className="size-5 accent-primary"
            />
            <span>{labels[type]}</span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-wrong">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={sendTest} disabled={test === "Sending"}>
          Send me a test email
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {test}
        </span>
      </div>
    </fieldset>
  );
}
