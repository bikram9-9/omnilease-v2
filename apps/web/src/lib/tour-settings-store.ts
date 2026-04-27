import { db, eq, properties, propertyTourSettings } from '@omnilease/db';
import { getTourAvailability } from '@/lib/tour-availability';
import { normalizeTourSettings } from '@/lib/tour-settings';

export async function getTourSettingsForProperty(propertyId: string) {
  const [settingsRow] = await db
    .select()
    .from(propertyTourSettings)
    .where(eq(propertyTourSettings.propertyId, propertyId))
    .limit(1);

  return normalizeTourSettings(settingsRow);
}

export async function getTourAvailabilityForProperty(
  propertyId: string,
  options: { startDate?: string; endDate?: string; now?: Date } = {},
) {
  const [property] = await db
    .select({ id: properties.id, timezone: properties.timezone })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) return null;

  const settings = await getTourSettingsForProperty(property.id);
  return getTourAvailability(settings, {
    timezone: property.timezone,
    ...options,
  });
}
