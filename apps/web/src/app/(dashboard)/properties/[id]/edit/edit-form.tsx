'use client';

import { useState, useTransition } from 'react';
import { updateProperty, deleteProperty } from '../../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Property } from '@omnilease/db';
import { formatFeeLines, parseFeeLines } from '@/lib/quote-fees';

export function EditForm({ property }: { property: Property }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateProperty(property.id, {
          name: String(formData.get('name') ?? ''),
          slug: String(formData.get('slug') ?? ''),
          address: String(formData.get('address') ?? ''),
          city: String(formData.get('city') ?? ''),
          state: String(formData.get('state') ?? ''),
          zip: String(formData.get('zip') ?? ''),
          timezone: String(formData.get('timezone') ?? 'America/New_York'),
          websiteWidgetId: String(formData.get('websiteWidgetId') ?? ''),
          messengerPageId: String(formData.get('messengerPageId') ?? ''),
          brandColor: String(formData.get('brandColor') ?? ''),
          escalationEmail: String(formData.get('escalationEmail') ?? ''),
          welcomeMessage: String(formData.get('welcomeMessage') ?? ''),
          aiDisclosure: String(formData.get('aiDisclosure') ?? ''),
          privacyNoticeUrl: String(formData.get('privacyNoticeUrl') ?? ''),
          termsUrl: String(formData.get('termsUrl') ?? ''),
          privacyDisclosureText: String(formData.get('privacyDisclosureText') ?? ''),
          contactFallbackLabel: String(formData.get('contactFallbackLabel') ?? ''),
          contactFallbackUrl: String(formData.get('contactFallbackUrl') ?? ''),
          contactFallbackText: String(formData.get('contactFallbackText') ?? ''),
          applicationUrl: String(formData.get('applicationUrl') ?? ''),
          applicationFee: numOrNull(formData.get('applicationFee')),
          quoteDisclaimer: String(formData.get('quoteDisclaimer') ?? ''),
          leasingSpecials: String(formData.get('leasingSpecials') ?? ''),
          recurringFees: parseFeeLines(String(formData.get('recurringFees') ?? '')),
          oneTimeFees: parseFeeLines(String(formData.get('oneTimeFees') ?? '')),
          petFees: parseFeeLines(String(formData.get('petFees') ?? '')),
          parkingFees: parseFeeLines(String(formData.get('parkingFees') ?? '')),
        });
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    });
  }

  function onDelete() {
    if (!confirm('Delete this property? This removes all units and conversations.')) return;
    startTransition(() => deleteProperty(property.id));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Edit property</h1>
      <form action={onSubmit} className="space-y-4">
        <Field id="name" label="Name" defaultValue={property.name} required />
        <Field id="slug" label="Slug" defaultValue={property.slug} />
        <Field id="address" label="Street address" defaultValue={property.address ?? ''} />
        <div className="grid grid-cols-2 gap-4">
          <Field id="city" label="City" defaultValue={property.city ?? ''} />
          <Field id="state" label="State (2-letter)" defaultValue={property.state ?? ''} maxLength={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="zip" label="ZIP" defaultValue={property.zip ?? ''} maxLength={10} />
          <Field id="timezone" label="Timezone" defaultValue={property.timezone} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="websiteWidgetId" label="Website widget ID" defaultValue={property.websiteWidgetId ?? ''} />
          <Field id="messengerPageId" label="Messenger page ID" defaultValue={property.messengerPageId ?? ''} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="brandColor" label="Brand color (#RRGGBB)" defaultValue={property.brandColor ?? ''} />
          <Field id="escalationEmail" label="Escalation email" type="email" defaultValue={property.escalationEmail ?? ''} />
        </div>
        <TextareaField id="welcomeMessage" label="Welcome message" defaultValue={property.welcomeMessage ?? ''} />
        <TextareaField id="aiDisclosure" label="AI disclosure" defaultValue={property.aiDisclosure ?? ''} />
        <div className="grid grid-cols-2 gap-4">
          <Field id="privacyNoticeUrl" label="Privacy notice URL" type="url" defaultValue={property.privacyNoticeUrl ?? ''} />
          <Field id="termsUrl" label="Terms URL" type="url" defaultValue={property.termsUrl ?? ''} />
        </div>
        <TextareaField
          id="privacyDisclosureText"
          label="Privacy disclosure copy"
          defaultValue={property.privacyDisclosureText ?? ''}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field
            id="contactFallbackLabel"
            label="Contact fallback label"
            defaultValue={property.contactFallbackLabel ?? ''}
          />
          <Field
            id="contactFallbackUrl"
            label="Contact fallback URL"
            defaultValue={property.contactFallbackUrl ?? ''}
          />
        </div>
        <TextareaField
          id="contactFallbackText"
          label="Contact fallback text"
          defaultValue={property.contactFallbackText ?? ''}
        />
        <div className="border-t border-zinc-800 pt-4">
          <h2 className="text-sm font-medium text-zinc-100">Quote and application MVP</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Fee lines use: Label | amount | required/optional | notes.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="applicationUrl" label="Application URL" type="url" defaultValue={property.applicationUrl ?? ''} />
          <Field id="applicationFee" label="Application fee ($)" type="number" defaultValue={property.applicationFee ?? ''} />
        </div>
        <TextareaField id="recurringFees" label="Required monthly fees" defaultValue={formatFeeLines(property.recurringFees)} />
        <TextareaField id="oneTimeFees" label="One-time move-in fees" defaultValue={formatFeeLines(property.oneTimeFees)} />
        <TextareaField id="petFees" label="Pet fees" defaultValue={formatFeeLines(property.petFees)} />
        <TextareaField id="parkingFees" label="Parking fees" defaultValue={formatFeeLines(property.parkingFees)} />
        <TextareaField id="leasingSpecials" label="Leasing specials" defaultValue={property.leasingSpecials ?? ''} />
        <TextareaField id="quoteDisclaimer" label="Quote disclaimer" defaultValue={property.quoteDisclaimer ?? ''} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>Save</Button>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={isPending}>Delete</Button>
        </div>
      </form>
    </div>
  );
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function TextareaField(props: { id: string; label: string; defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Textarea
        id={props.id}
        name={props.id}
        defaultValue={props.defaultValue}
        className="bg-zinc-900 border-zinc-800"
      />
    </div>
  );
}

function Field(props: {
  id: string; label: string; required?: boolean; maxLength?: number; defaultValue?: string; type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id} name={props.id} required={props.required}
        type={props.type}
        maxLength={props.maxLength} defaultValue={props.defaultValue}
        className="bg-zinc-900 border-zinc-800"
      />
    </div>
  );
}
