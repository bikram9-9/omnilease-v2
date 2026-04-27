import { notFound } from 'next/navigation';
import { and, db, eq, properties, propertyAssistantSettings } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  defaultAssistantSettings,
  normalizeAssistantSettings,
} from '@/lib/assistant-settings';
import { resetAssistantSettingsAction, saveAssistantSettingsAction } from './actions';

export default async function AssistantSettingsPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [property] = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!property) notFound();

  const [settingsRow] = await db
    .select()
    .from(propertyAssistantSettings)
    .where(eq(propertyAssistantSettings.propertyId, property.id))
    .limit(1);
  const settings = normalizeAssistantSettings(settingsRow);
  const saveAction = saveAssistantSettingsAction.bind(null, property.id);
  const resetAction = resetAssistantSettingsAction.bind(null, property.id);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assistant settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {property.name} · version {settings.version}
        </p>
      </div>

      <form action={saveAction} className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            id="primaryGoal"
            label="Primary goal"
            defaultValue={settings.primaryGoal}
            options={[
              ['book_tour', 'Book tours'],
              ['qualify_lead', 'Qualify leads'],
              ['answer_questions', 'Answer questions'],
              ['route_to_human', 'Route to human'],
            ]}
          />
          <SelectField
            id="tone"
            label="Tone"
            defaultValue={settings.tone}
            options={[
              ['warm_professional', 'Warm professional'],
              ['concise_direct', 'Concise direct'],
              ['luxury_concierge', 'Luxury concierge'],
              ['friendly_casual', 'Friendly casual'],
            ]}
          />
          <SelectField
            id="ctaPreference"
            label="CTA"
            defaultValue={settings.ctaPreference}
            options={[
              ['ask_for_tour', 'Ask for tour'],
              ['ask_for_contact', 'Ask for contact'],
              ['offer_human', 'Offer human'],
              ['answer_only', 'Answer only'],
            ]}
          />
        </div>

        <MultiLineField
          id="screeningQuestions"
          label="Screening questions"
          defaultValue={settings.screeningQuestions.join('\n')}
        />
        <MultiLineField
          id="sellingPoints"
          label="Selling points"
          defaultValue={settings.sellingPoints.join('\n')}
        />
        <MultiLineField
          id="escalationTriggers"
          label="Escalation triggers"
          defaultValue={settings.escalationTriggers.join('\n')}
        />

        <div className="flex flex-wrap justify-end gap-2">
          <Button formAction={resetAction} type="submit" variant="outline">
            Reset defaults
          </Button>
          <Button type="submit">Save settings</Button>
        </div>
      </form>

      {!settingsRow && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Defaults are active until settings are saved.
          Current default escalation triggers: {defaultAssistantSettings.escalationTriggers.join(', ')}.
        </div>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  defaultValue,
  options,
}: {
  id: string;
  label: string;
  defaultValue: string;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={id}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100"
      >
        {options.map(([value, labelText]) => (
          <option key={value} value={value}>{labelText}</option>
        ))}
      </select>
    </div>
  );
}

function MultiLineField({
  id,
  label,
  defaultValue,
}: {
  id: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={id}
        defaultValue={defaultValue}
        className="min-h-28 border-zinc-800 bg-zinc-900"
      />
    </div>
  );
}
