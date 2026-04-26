import { db, eq, propertyTourSettings } from '@omnilease/db';
import { normalizeTourSettings } from '@/lib/tour-settings';

export async function getTourSettingsForProperty(propertyId: string) {
  const [settingsRow] = await db
    .select()
    .from(propertyTourSettings)
    .where(eq(propertyTourSettings.propertyId, propertyId))
    .limit(1);

  return normalizeTourSettings(settingsRow);
}
