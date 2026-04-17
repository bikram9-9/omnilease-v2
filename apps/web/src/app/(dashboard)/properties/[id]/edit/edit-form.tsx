'use client';

import { useState, useTransition } from 'react';
import { updateProperty, deleteProperty } from '../../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Property } from '@omnilease/db';

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
          welcomeMessage: String(formData.get('welcomeMessage') ?? ''),
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
          <Field id="welcomeMessage" label="Welcome message" defaultValue={property.welcomeMessage ?? ''} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>Save</Button>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={isPending}>Delete</Button>
        </div>
      </form>
    </div>
  );
}

function Field(props: {
  id: string; label: string; required?: boolean; maxLength?: number; defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id} name={props.id} required={props.required}
        maxLength={props.maxLength} defaultValue={props.defaultValue}
        className="bg-zinc-900 border-zinc-800"
      />
    </div>
  );
}
