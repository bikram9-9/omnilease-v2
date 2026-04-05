'use client';

import { useState, useTransition } from 'react';
import { createProperty } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewPropertyPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createProperty({
          name: String(formData.get('name') ?? ''),
          address: String(formData.get('address') ?? ''),
          city: String(formData.get('city') ?? ''),
          state: String(formData.get('state') ?? ''),
          zip: String(formData.get('zip') ?? ''),
          timezone: String(formData.get('timezone') ?? 'America/New_York'),
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
        <Field id="address" label="Street address" />
        <div className="grid grid-cols-2 gap-4">
          <Field id="city" label="City" />
          <Field id="state" label="State (2-letter)" maxLength={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="zip" label="ZIP" maxLength={10} />
          <Field id="timezone" label="Timezone" defaultValue="America/New_York" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create property'}
        </Button>
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
        id={props.id}
        name={props.id}
        required={props.required}
        maxLength={props.maxLength}
        defaultValue={props.defaultValue}
        className="bg-zinc-900 border-zinc-800"
      />
    </div>
  );
}
