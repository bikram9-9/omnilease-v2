import { notFound } from 'next/navigation';
import {
  and,
  asc,
  db,
  desc,
  eq,
  properties,
  propertyTourSettings,
  tourBookings,
  tourOwners,
  type TourOwner,
} from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  defaultTourSettings,
  normalizeTourSettings,
  tourTypeLabels,
  validateTourSettings,
} from '@/lib/tour-settings';
import { getTourAvailability, type TourAvailabilityResult } from '@/lib/tour-availability';
import {
  resetTourSettingsAction,
  saveTourSettingsAction,
  updateTourBookingOwnerAction,
} from './actions';

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
const ownerRowCount = 6;

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

  const [settingsRow, ownerRows, recentBookings] = await Promise.all([
    db
    .select()
    .from(propertyTourSettings)
    .where(eq(propertyTourSettings.propertyId, property.id))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(tourOwners)
      .where(eq(tourOwners.propertyId, property.id))
      .orderBy(asc(tourOwners.assignmentPriority), asc(tourOwners.displayName)),
    db
      .select({
        id: tourBookings.id,
        status: tourBookings.status,
        startAt: tourBookings.startAt,
        endAt: tourBookings.endAt,
        timezone: tourBookings.timezone,
        tourType: tourBookings.tourType,
        tourOwnerId: tourBookings.tourOwnerId,
        ownerAssignmentStatus: tourBookings.ownerAssignmentStatus,
        ownerAssignmentReason: tourBookings.ownerAssignmentReason,
        ownerName: tourOwners.displayName,
      })
      .from(tourBookings)
      .leftJoin(tourOwners, eq(tourOwners.id, tourBookings.tourOwnerId))
      .where(eq(tourBookings.propertyId, property.id))
      .orderBy(desc(tourBookings.startAt))
      .limit(10),
  ]);
  const settings = normalizeTourSettings(settingsRow);
  const warnings = validateTourSettings(settings, property.timezone);
  const availability = await getTourAvailability(settings, {
    timezone: property.timezone,
    now: new Date(),
  });
  const previewSlots = availability.slots.slice(0, 8);
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

          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-sm font-medium text-zinc-100">Next available slots</div>
            <ProviderStatus status={availability.status} />
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

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-zinc-100">Calendar availability</legend>
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
            <SelectField
              id="calendarProvider"
              label="Provider"
              defaultValue={settings.calendarProvider}
              options={[
                ['none', 'Settings only'],
                ['google_calendar', 'Google Calendar'],
              ]}
            />
            <div className="space-y-2">
              <Label htmlFor="calendarId">Calendar ID</Label>
              <Input
                id="calendarId"
                name="calendarId"
                defaultValue={settings.calendarId ?? ''}
                placeholder="primary or leasing@example.com"
                className="border-zinc-800 bg-zinc-900"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Google Calendar uses the server OAuth credentials and this property calendar ID for free/busy checks.
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-zinc-100">Tour owners</legend>
          <p className="text-xs text-zinc-500">
            Lower priority numbers are assigned first. Owner calendars override property slots when configured.
          </p>
          <div className="space-y-3">
            {buildOwnerRows(ownerRows).map((owner, index) => (
              <TourOwnerRow key={owner?.id ?? `new-${index}`} owner={owner} index={index} />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2">
          <Button formAction={resetAction} type="submit" variant="outline">
            Reset defaults
          </Button>
          <Button type="submit">Save tour settings</Button>
        </div>
      </form>

      <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div>
          <h2 className="text-sm font-medium text-zinc-100">Recent tour ownership</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Update ownership when a tour needs manual routing or reassignment.
          </p>
        </div>
        {recentBookings.length === 0 ? (
          <p className="text-sm text-zinc-500">No tour bookings yet.</p>
        ) : (
          <div className="space-y-3">
            {recentBookings.map((booking) => (
              <form
                key={booking.id}
                action={updateTourBookingOwnerAction.bind(null, property.id)}
                className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm lg:grid-cols-[minmax(0,1fr)_220px_auto]"
              >
                <input type="hidden" name="bookingId" value={booking.id} />
                <div>
                  <div className="font-medium text-zinc-100">
                    {formatBookingDate(booking.startAt, booking.endAt, booking.timezone)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {tourTypeLabels[booking.tourType]} · {booking.status} · {booking.ownerAssignmentStatus}
                  </div>
                  {booking.ownerAssignmentReason && (
                    <div className="mt-1 text-xs text-amber-300">{booking.ownerAssignmentReason}</div>
                  )}
                </div>
                <select
                  name="tourOwnerId"
                  defaultValue={booking.tourOwnerId ?? ''}
                  className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                >
                  <option value="">Manual assignment needed</option>
                  {ownerRows.map((owner) => (
                    <option key={owner.id} value={owner.id}>{owner.displayName}</option>
                  ))}
                </select>
                <Button type="submit" variant="outline">Update owner</Button>
              </form>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProviderStatus({ status }: { status: TourAvailabilityResult['status'] }) {
  const tone = status.status === 'available'
    ? 'text-emerald-300'
    : status.status === 'not_configured'
      ? 'text-zinc-500'
      : 'text-amber-300';

  return (
    <div className={`mt-2 text-xs ${tone}`}>
      {status.message}
      {status.error ? <span className="block text-zinc-500">{status.error}</span> : null}
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

function TourOwnerRow({ owner, index }: { owner: TourOwner | null; index: number }) {
  const enabledTypes = owner?.tourTypes ?? ['in_person'];

  return (
    <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <input type="hidden" name={`ownerId_${index}`} value={owner?.id ?? ''} />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px]">
        <div className="space-y-2">
          <Label htmlFor={`ownerDisplayName_${index}`}>Name</Label>
          <Input
            id={`ownerDisplayName_${index}`}
            name={`ownerDisplayName_${index}`}
            defaultValue={owner?.displayName ?? ''}
            placeholder="Leasing agent"
            className="border-zinc-800 bg-zinc-950"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`ownerEmail_${index}`}>Email</Label>
          <Input
            id={`ownerEmail_${index}`}
            name={`ownerEmail_${index}`}
            defaultValue={owner?.email ?? ''}
            placeholder="agent@example.com"
            className="border-zinc-800 bg-zinc-950"
          />
        </div>
        <NumberField
          id={`ownerPriority_${index}`}
          label="Priority"
          min={1}
          max={999}
          step={1}
          defaultValue={owner?.assignmentPriority ?? (index + 1) * 10}
          suffix=""
        />
      </div>

      <div className="grid gap-3 md:grid-cols-[160px_180px_minmax(0,1fr)]">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            name={`ownerActive_${index}`}
            type="checkbox"
            defaultChecked={owner ? owner.isActive === 1 : true}
            className="size-4"
          />
          <span>Active</span>
        </label>
        <SelectField
          id={`ownerCalendarProvider_${index}`}
          label="Calendar"
          defaultValue={owner?.calendarProvider ?? 'none'}
          options={[
            ['none', 'No owner calendar'],
            ['google_calendar', 'Google Calendar'],
          ]}
        />
        <div className="space-y-2">
          <Label htmlFor={`ownerCalendarId_${index}`}>Owner calendar ID</Label>
          <Input
            id={`ownerCalendarId_${index}`}
            name={`ownerCalendarId_${index}`}
            defaultValue={owner?.calendarId ?? ''}
            placeholder="agent@example.com"
            className="border-zinc-800 bg-zinc-950"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {tourTypes.map(([type, label]) => (
          <label key={type} className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              name={`ownerTourTypes_${index}`}
              type="checkbox"
              value={type}
              defaultChecked={enabledTypes.includes(type)}
              className="size-4"
            />
            <span>{label}</span>
          </label>
        ))}
        {owner && (
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input name={`ownerDelete_${index}`} type="checkbox" className="size-4" />
            <span>Disable</span>
          </label>
        )}
      </div>
    </div>
  );
}

function buildOwnerRows(owners: TourOwner[]) {
  return Array.from({ length: ownerRowCount }, (_, index) => owners[index] ?? null);
}

function formatBookingDate(startAt: Date, endAt: Date, timezone: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(startAt);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} · ${time.format(startAt)}-${time.format(endAt)}`;
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
