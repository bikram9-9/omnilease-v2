import { notFound } from 'next/navigation';
import { and, db, eq, properties, propertyTourSettings } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  defaultTourSettings,
  generateTourSlots,
  normalizeTourSettings,
  tourTypeLabels,
  validateTourSettings,
} from '@/lib/tour-settings';
import { resetTourSettingsAction, saveTourSettingsAction } from './actions';

const days = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const;

const tourTypes = Object.entries(tourTypeLabels) as Array<[keyof typeof tourTypeLabels, string]>;

export default async function TourSettingsPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [property] = await db
    .select({ id: properties.id, name: properties.name, timezone: properties.timezone })
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!property) notFound();

  const [settingsRow] = await db
    .select()
    .from(propertyTourSettings)
    .where(eq(propertyTourSettings.propertyId, property.id))
    .limit(1);
  const settings = normalizeTourSettings(settingsRow);
  const warnings = validateTourSettings(settings, property.timezone);
  const previewSlots = generateTourSlots(settings, {
    timezone: property.timezone,
    now: new Date(),
  }).slice(0, 8);
  const saveAction = saveTourSettingsAction.bind(null, property.id);
  const resetAction = resetTourSettingsAction.bind(null, property.id);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tour settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {property.name} · {property.timezone}
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-medium">Settings need review</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <form action={saveAction} className="space-y-6 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-zinc-100">Tour types</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {tourTypes.map(([type, label]) => (
              <label
                key={type}
                className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              >
                <input
                  name="tourTypes"
                  type="checkbox"
                  value={type}
                  defaultChecked={settings.enabledTourTypes.includes(type)}
                  className="size-4"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-4">
          <NumberField
            id="defaultDurationMinutes"
            label="Duration"
            min={15}
            max={240}
            step={15}
            defaultValue={settings.defaultDurationMinutes}
            suffix="minutes"
          />
          <NumberField
            id="bufferMinutes"
            label="Buffer"
            min={0}
            max={240}
            step={5}
            defaultValue={settings.bufferMinutes}
            suffix="minutes"
          />
          <NumberField
            id="capacityPerSlot"
            label="Capacity"
            min={1}
            max={25}
            step={1}
            defaultValue={settings.capacityPerSlot}
            suffix="per slot"
          />
          <NumberField
            id="schedulingWindowDays"
            label="Booking window"
            min={1}
            max={365}
            step={1}
            defaultValue={settings.schedulingWindowDays}
            suffix="days"
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-zinc-100">Tour hours</legend>
          <div className="grid gap-3">
            {days.map(([day, label]) => {
              const hours = settings.tourHours[day];
              const defaults = defaultTourSettings.tourHours[day] ?? { open: '09:00', close: '17:00' };
              return (
                <div key={day} className="grid items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3 sm:grid-cols-[160px_1fr_1fr]">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name={`${day}Enabled`}
                      type="checkbox"
                      defaultChecked={Boolean(hours)}
                      className="size-4"
                    />
                    <span>{label}</span>
                  </label>
                  <TimeField id={`${day}Open`} label={`${label} open`} defaultValue={hours?.open ?? defaults.open} />
                  <TimeField id={`${day}Close`} label={`${label} close`} defaultValue={hours?.close ?? defaults.close} />
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-2">
            <Label htmlFor="blackoutDates">Blackout dates</Label>
            <Textarea
              id="blackoutDates"
              name="blackoutDates"
              defaultValue={settings.blackoutDates.join('\n')}
              className="min-h-36 border-zinc-800 bg-zinc-900 font-mono"
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-sm font-medium text-zinc-100">Next available slots</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              {previewSlots.length > 0 ? previewSlots.map((slot) => (
                <div key={`${slot.date}-${slot.startTime}`} className="flex justify-between gap-3">
                  <span>{slot.date}</span>
                  <span>{slot.startTime}-{slot.endTime}</span>
                </div>
              )) : (
                <div className="text-zinc-500">No slots generated from current settings.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button formAction={resetAction} type="submit" variant="outline">
            Reset defaults
          </Button>
          <Button type="submit">Save tour settings</Button>
        </div>
      </form>
    </div>
  );
}

function NumberField({
  id,
  label,
  min,
  max,
  step,
  defaultValue,
  suffix,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  suffix: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={id}
          type="number"
          min={min}
          max={max}
          step={step}
          defaultValue={defaultValue}
          className="border-zinc-800 bg-zinc-900"
        />
        <span className="text-xs text-zinc-500">{suffix}</span>
      </div>
    </div>
  );
}

function TimeField({ id, label, defaultValue }: { id: string; label: string; defaultValue: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="sr-only">{label}</Label>
      <Input
        id={id}
        name={id}
        type="time"
        defaultValue={defaultValue}
        className="border-zinc-800 bg-zinc-950"
      />
    </div>
  );
}
