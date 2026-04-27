'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import {
  and,
  db,
  eq,
  properties,
  propertyTourSettings,
  sql,
  tourBookings,
  tourOwners,
  type TourType,
} from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { defaultTourSettings, parseTourSettingsForm } from '@/lib/tour-settings';

const tourTypeValues: TourType[] = ['in_person', 'virtual', 'self_guided'];
const ownerRowCount = 6;

type ParsedTourOwnerRow = {
  id: string | null;
  delete: boolean;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  tourTypes: TourType[];
  calendarProvider: 'none' | 'google_calendar';
  calendarId: string | null;
  assignmentPriority: number;
  notes: string | null;
};

async function assertPropertyAccess(propertyId: string) {
  const { orgId, userId } = await requireOrg();
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!property) notFound();
  return { userId };
}

export async function saveTourSettingsAction(propertyId: string, formData: FormData) {
  const { userId } = await assertPropertyAccess(propertyId);
  const input = parseTourSettingsForm(formData);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(propertyTourSettings)
      .values({
        propertyId,
        ...input,
        updatedBy: userId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [propertyTourSettings.propertyId],
        set: {
          ...input,
          updatedBy: userId,
          updatedAt: now,
        },
      });

    for (const owner of parseTourOwnerRows(formData)) {
      if (owner.id && owner.delete) {
        await tx
          .update(tourOwners)
          .set({ isActive: 0, updatedAt: now })
          .where(and(eq(tourOwners.id, owner.id), eq(tourOwners.propertyId, propertyId)));
        continue;
      }

      if (owner.id) {
        await tx
          .update(tourOwners)
          .set({
            displayName: owner.displayName,
            email: owner.email,
            phone: owner.phone,
            isActive: owner.isActive ? 1 : 0,
            tourTypes: owner.tourTypes,
            calendarProvider: owner.calendarProvider,
            calendarId: owner.calendarId,
            assignmentPriority: owner.assignmentPriority,
            notes: owner.notes,
            updatedAt: now,
          })
          .where(and(eq(tourOwners.id, owner.id), eq(tourOwners.propertyId, propertyId)));
        continue;
      }

      if (!owner.delete) {
        await tx.insert(tourOwners).values({
          propertyId,
          displayName: owner.displayName,
          email: owner.email,
          phone: owner.phone,
          isActive: owner.isActive ? 1 : 0,
          tourTypes: owner.tourTypes,
          calendarProvider: owner.calendarProvider,
          calendarId: owner.calendarId,
          assignmentPriority: owner.assignmentPriority,
          notes: owner.notes,
          updatedAt: now,
        });
      }
    }
  });

  revalidatePath(`/properties/${propertyId}/tours`);
  revalidatePath(`/properties/${propertyId}`);
}

export async function resetTourSettingsAction(propertyId: string) {
  const { userId } = await assertPropertyAccess(propertyId);
  const now = new Date();

  await db
    .insert(propertyTourSettings)
    .values({
      propertyId,
      ...defaultTourSettings,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [propertyTourSettings.propertyId],
      set: {
        ...defaultTourSettings,
        updatedBy: userId,
        updatedAt: now,
      },
    });

  revalidatePath(`/properties/${propertyId}/tours`);
  redirect(`/properties/${propertyId}/tours`);
}

export async function updateTourBookingOwnerAction(propertyId: string, formData: FormData) {
  await assertPropertyAccess(propertyId);
  const bookingId = String(formData.get('bookingId') ?? '');
  const ownerId = String(formData.get('tourOwnerId') ?? '');
  const now = new Date();

  if (!bookingId) return;

  if (!ownerId) {
    await db
      .update(tourBookings)
      .set({
        tourOwnerId: null,
        ownerAssignmentStatus: 'manual_required',
        ownerAssignmentReason: 'Operator cleared the assigned tour owner.',
        calendarProvider: null,
        calendarId: null,
        updatedAt: now,
      })
      .where(and(eq(tourBookings.id, bookingId), eq(tourBookings.propertyId, propertyId)));
    revalidatePath(`/properties/${propertyId}/tours`);
    return;
  }

  const [owner] = await db
    .select()
    .from(tourOwners)
    .where(and(eq(tourOwners.id, ownerId), eq(tourOwners.propertyId, propertyId)))
    .limit(1);
  if (!owner) notFound();

  await db
    .update(tourBookings)
    .set({
      tourOwnerId: owner.id,
      ownerAssignmentStatus: 'assigned',
      ownerAssignmentReason: 'Operator manually assigned the tour owner.',
      calendarProvider: owner.calendarProvider,
      calendarId: owner.calendarId,
      metadata: sql`coalesce(${tourBookings.metadata}, '{}'::jsonb) || ${JSON.stringify({
        tourOwnerName: owner.displayName,
        manuallyAssignedOwnerAt: now.toISOString(),
      })}::jsonb`,
      updatedAt: now,
    })
    .where(and(eq(tourBookings.id, bookingId), eq(tourBookings.propertyId, propertyId)));

  revalidatePath(`/properties/${propertyId}/tours`);
}

function parseTourOwnerRows(formData: FormData): ParsedTourOwnerRow[] {
  const owners: ParsedTourOwnerRow[] = [];
  for (let index = 0; index < ownerRowCount; index += 1) {
    const id = normalizeText(formData.get(`ownerId_${index}`));
    const displayName = normalizeText(formData.get(`ownerDisplayName_${index}`));
    const deleteRow = formData.get(`ownerDelete_${index}`) === 'on' || !displayName;
    if (!id && deleteRow) continue;

    const selectedTypes = formData
      .getAll(`ownerTourTypes_${index}`)
      .map((value) => String(value))
      .filter((value): value is TourType => tourTypeValues.includes(value as TourType));

    owners.push({
      id,
      delete: deleteRow,
      displayName: displayName ?? 'Leasing agent',
      email: normalizeText(formData.get(`ownerEmail_${index}`)),
      phone: normalizeText(formData.get(`ownerPhone_${index}`)),
      isActive: formData.get(`ownerActive_${index}`) === 'on',
      tourTypes: selectedTypes.length ? selectedTypes : ['in_person'],
      calendarProvider: formData.get(`ownerCalendarProvider_${index}`) === 'google_calendar'
        ? 'google_calendar'
        : 'none',
      calendarId: normalizeText(formData.get(`ownerCalendarId_${index}`)),
      assignmentPriority: parsePriority(formData.get(`ownerPriority_${index}`), index),
      notes: normalizeText(formData.get(`ownerNotes_${index}`)),
    });
  }
  return owners;
}

function normalizeText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function parsePriority(value: FormDataEntryValue | null, index: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return (index + 1) * 10;
  return Math.min(999, Math.max(1, Math.trunc(parsed)));
}
