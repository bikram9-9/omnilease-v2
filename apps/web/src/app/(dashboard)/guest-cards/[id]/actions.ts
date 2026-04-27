'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/auth';
import {
  mergeGuestCardsForOrg,
  revertGuestCardMergeForOrg,
} from '@/lib/guest-cards/service';
import { cancelScheduledTourNotificationForOrg } from '@/lib/tour-notifications';

export async function mergeDuplicateGuestCardAction(formData: FormData) {
  const { orgId, userId } = await requireOrg();
  const targetGuestCardId = String(formData.get('targetGuestCardId') ?? '');
  const sourceGuestCardId = String(formData.get('sourceGuestCardId') ?? '');
  const duplicateCandidateId = String(formData.get('duplicateCandidateId') ?? '') || null;

  if (!targetGuestCardId || !sourceGuestCardId) {
    throw new Error('Missing guest card merge target');
  }

  await mergeGuestCardsForOrg({
    orgId,
    userId,
    targetGuestCardId,
    sourceGuestCardId,
    duplicateCandidateId,
  });
  revalidatePath(`/guest-cards/${targetGuestCardId}`);
}

export async function revertGuestCardMergeAction(formData: FormData) {
  const { orgId, userId } = await requireOrg();
  const guestCardId = String(formData.get('guestCardId') ?? '');
  const mergeAuditId = String(formData.get('mergeAuditId') ?? '');

  if (!guestCardId || !mergeAuditId) {
    throw new Error('Missing merge audit');
  }

  await revertGuestCardMergeForOrg({ orgId, userId, mergeAuditId });
  revalidatePath(`/guest-cards/${guestCardId}`);
}

export async function cancelScheduledFollowUpAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const guestCardId = String(formData.get('guestCardId') ?? '');
  const jobId = String(formData.get('jobId') ?? '');

  if (!guestCardId || !jobId) {
    throw new Error('Missing scheduled follow-up');
  }

  await cancelScheduledTourNotificationForOrg({ orgId, guestCardId, jobId });
  revalidatePath(`/guest-cards/${guestCardId}`);
}
