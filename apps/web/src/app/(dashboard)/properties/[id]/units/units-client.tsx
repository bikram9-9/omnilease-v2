'use client';

import { useState, useTransition } from 'react';
import type { UnitType } from '@omnilease/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createUnitType, updateUnitType, deleteUnitType } from './actions';

export function UnitsClient({
  propertyId,
  units,
}: {
  propertyId: string;
  units: UnitType[];
}) {
  const [editing, setEditing] = useState<UnitType | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const payload = {
      name: String(formData.get('name') ?? ''),
      bedrooms: Number(formData.get('bedrooms') ?? 0),
      bathrooms: Number(formData.get('bathrooms') ?? 0),
      sqftMin: numOrNull(formData.get('sqftMin')),
      sqftMax: numOrNull(formData.get('sqftMax')),
      priceMin: numOrNull(formData.get('priceMin')),
      priceMax: numOrNull(formData.get('priceMax')),
      availableCount: Number(formData.get('availableCount') ?? 0),
      deposit: numOrNull(formData.get('deposit')),
      description: String(formData.get('description') ?? '') || null,
    };
    startTransition(async () => {
      if (editing) await updateUnitType(propertyId, editing.id, payload);
      else await createUnitType(propertyId, payload);
      setOpen(false);
      setEditing(null);
    });
  }

  function del(id: string) {
    if (!confirm('Delete this unit?')) return;
    startTransition(() => deleteUnitType(propertyId, id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Units</h2>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger render={<Button>Add unit</Button>} />
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit' : 'New'} unit</DialogTitle>
            </DialogHeader>
            <form action={submit} className="space-y-3">
              <Field id="name" label="Name" defaultValue={editing?.name} required />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="bedrooms"
                  label="Bedrooms"
                  type="number"
                  defaultValue={editing?.bedrooms}
                  required
                />
                <Field
                  id="bathrooms"
                  label="Bathrooms"
                  type="number"
                  step="0.5"
                  defaultValue={editing?.bathrooms}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="sqftMin" label="Sqft min" type="number" defaultValue={editing?.sqftMin ?? ''} />
                <Field id="sqftMax" label="Sqft max" type="number" defaultValue={editing?.sqftMax ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="priceMin" label="Price min ($)" type="number" defaultValue={editing?.priceMin ?? ''} />
                <Field id="priceMax" label="Price max ($)" type="number" defaultValue={editing?.priceMax ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="availableCount"
                  label="Available"
                  type="number"
                  defaultValue={editing?.availableCount ?? 0}
                />
                <Field id="deposit" label="Deposit ($)" type="number" defaultValue={editing?.deposit ?? ''} />
              </div>
              <Field id="description" label="Description" defaultValue={editing?.description ?? ''} />
              <Button type="submit" disabled={isPending}>
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {units.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="py-10 text-center text-zinc-400">
            No units yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {units.map((u) => (
            <Card key={u.id} className="border-zinc-800 bg-zinc-900">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-sm text-zinc-400">
                    {u.bedrooms}BR/{u.bathrooms}BA &middot; {u.availableCount} available
                    {u.priceMin ? ` · $${u.priceMin}–$${u.priceMax ?? u.priceMin}` : ' · —'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(u);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => del(u.id)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Field(props: {
  id: string;
  label: string;
  required?: boolean;
  type?: string;
  step?: string;
  defaultValue?: string | number | null;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        name={props.id}
        type={props.type ?? 'text'}
        step={props.step}
        required={props.required}
        defaultValue={props.defaultValue == null ? '' : String(props.defaultValue)}
        className="bg-zinc-950 border-zinc-800"
      />
    </div>
  );
}
