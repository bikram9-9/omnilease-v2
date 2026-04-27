'use client';

import { useState, useTransition } from 'react';
import { createProperty } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function NewPropertyPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createProperty({
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
          applicationUrl: '',
          applicationFee: null,
          quoteDisclaimer: '',
          leasingSpecials: '',
          recurringFees: [],
          oneTimeFees: [],
          petFees: [],
          parkingFees: [],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create property');
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New property</h1>
      <form action={onSubmit} className="space-y-4">
        <Field id="name" label="Name" required />
        <Field id="slug" label="Slug (used for content/properties/<slug>)" />
        <Field id="address" label="Street address" />
        <div className="grid grid-cols-2 gap-4">
          <Field id="city" label="City" />
          <Field id="state" label="State (2-letter)" maxLength={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="zip" label="ZIP" maxLength={10} />
          <Field id="timezone" label="Timezone" defaultValue="America/New_York" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="websiteWidgetId" label="Website widget ID" />
          <Field id="messengerPageId" label="Messenger page ID" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="brandColor" label="Brand color (#RRGGBB)" />
          <Field id="escalationEmail" label="Escalation email" type="email" />
        </div>
        <TextareaField id="welcomeMessage" label="Welcome message" />
        <TextareaField id="aiDisclosure" label="AI disclosure" />
        <div className="grid grid-cols-2 gap-4">
          <Field id="privacyNoticeUrl" label="Privacy notice URL" type="url" />
          <Field id="termsUrl" label="Terms URL" type="url" />
        </div>
        <TextareaField id="privacyDisclosureText" label="Privacy disclosure copy" />
        <div className="grid grid-cols-2 gap-4">
          <Field id="contactFallbackLabel" label="Contact fallback label" />
          <Field id="contactFallbackUrl" label="Contact fallback URL" />
        </div>
        <TextareaField id="contactFallbackText" label="Contact fallback text" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create property'}
        </Button>
      </form>
    </div>
  );
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
        id={props.id}
        name={props.id}
        type={props.type}
        required={props.required}
        maxLength={props.maxLength}
        defaultValue={props.defaultValue}
        className="bg-zinc-900 border-zinc-800"
      />
    </div>
  );
}
