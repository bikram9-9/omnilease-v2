'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { upsertKnowledge } from './actions';

type KB = Record<string, unknown>;

export function KnowledgeClient({
  propertyId, knowledge,
}: { propertyId: string; knowledge: KB }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Knowledge base</h2>
      <Tabs defaultValue="pricing">
        <TabsList>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="pets">Pets</TabsTrigger>
          <TabsTrigger value="parking">Parking</TabsTrigger>
          <TabsTrigger value="amenities">Amenities</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
        </TabsList>
        <TabsContent value="pricing">
          <PricingForm propertyId={propertyId} value={knowledge.pricing as PricingValue | undefined} />
        </TabsContent>
        <TabsContent value="pets">
          <PetsForm propertyId={propertyId} value={knowledge.pets as PetsValue | undefined} />
        </TabsContent>
        <TabsContent value="parking">
          <ParkingForm propertyId={propertyId} value={knowledge.parking as ParkingValue | undefined} />
        </TabsContent>
        <TabsContent value="amenities">
          <AmenitiesForm propertyId={propertyId} value={knowledge.amenities as AmenitiesValue | undefined} />
        </TabsContent>
        <TabsContent value="faqs">
          <FaqsForm propertyId={propertyId} value={knowledge.faqs as FaqsValue | undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Value types matching the validators (loose — the server re-validates)
type PricingValue = {
  specials?: string | null;
  applicationFee?: number | string | null;
  adminFee?: number | string | null;
  securityDepositNote?: string | null;
};
type PetsValue = {
  allowed?: boolean;
  weightLimitLbs?: number | string | null;
  breedRestrictions?: string | null;
  deposit?: number | string | null;
  monthlyPetRent?: number | string | null;
  maxPets?: number | string | null;
};
type ParkingValue = {
  surfaceIncluded?: boolean;
  garageAvailable?: boolean;
  garageMonthlyCost?: number | string | null;
  notes?: string | null;
};
type AmenitiesValue = { items?: string[] };
type FaqsValue = { entries?: { question: string; answer: string }[] };

function SaveBar({ onSave, pending }: { onSave: () => void; pending: boolean }) {
  return (
    <Button onClick={onSave} disabled={pending}>
      {pending ? 'Saving...' : 'Save'}
    </Button>
  );
}

function PricingForm({ propertyId, value }: { propertyId: string; value?: PricingValue }) {
  const [form, setForm] = useState<PricingValue>(value ?? {});
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => { void upsertKnowledge(propertyId, 'pricing', form); });
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Pricing &amp; fees</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Labeled label="Current specials">
          <Textarea
            value={form.specials ?? ''}
            onChange={(e) => setForm({ ...form, specials: e.target.value })}
          />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Application fee ($)">
            <Input
              type="number"
              value={form.applicationFee ?? ''}
              onChange={(e) => setForm({ ...form, applicationFee: e.target.value })}
            />
          </Labeled>
          <Labeled label="Admin fee ($)">
            <Input
              type="number"
              value={form.adminFee ?? ''}
              onChange={(e) => setForm({ ...form, adminFee: e.target.value })}
            />
          </Labeled>
        </div>
        <Labeled label="Security deposit note">
          <Input
            value={form.securityDepositNote ?? ''}
            onChange={(e) => setForm({ ...form, securityDepositNote: e.target.value })}
          />
        </Labeled>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function PetsForm({ propertyId, value }: { propertyId: string; value?: PetsValue }) {
  const [form, setForm] = useState<PetsValue>(value ?? { allowed: true });
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => { void upsertKnowledge(propertyId, 'pets', form); });
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Pet policy</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.allowed}
            onChange={(e) => setForm({ ...form, allowed: e.target.checked })}
          />
          Pets allowed
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Weight limit (lbs)">
            <Input
              type="number"
              value={form.weightLimitLbs ?? ''}
              onChange={(e) => setForm({ ...form, weightLimitLbs: e.target.value })}
            />
          </Labeled>
          <Labeled label="Max pets">
            <Input
              type="number"
              value={form.maxPets ?? ''}
              onChange={(e) => setForm({ ...form, maxPets: e.target.value })}
            />
          </Labeled>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Pet deposit ($)">
            <Input
              type="number"
              value={form.deposit ?? ''}
              onChange={(e) => setForm({ ...form, deposit: e.target.value })}
            />
          </Labeled>
          <Labeled label="Monthly pet rent ($)">
            <Input
              type="number"
              value={form.monthlyPetRent ?? ''}
              onChange={(e) => setForm({ ...form, monthlyPetRent: e.target.value })}
            />
          </Labeled>
        </div>
        <Labeled label="Breed restrictions">
          <Textarea
            value={form.breedRestrictions ?? ''}
            onChange={(e) => setForm({ ...form, breedRestrictions: e.target.value })}
          />
        </Labeled>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function ParkingForm({ propertyId, value }: { propertyId: string; value?: ParkingValue }) {
  const [form, setForm] = useState<ParkingValue>(
    value ?? { surfaceIncluded: true, garageAvailable: false },
  );
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => { void upsertKnowledge(propertyId, 'parking', form); });
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Parking</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.surfaceIncluded}
            onChange={(e) => setForm({ ...form, surfaceIncluded: e.target.checked })}
          />
          Surface parking included
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.garageAvailable}
            onChange={(e) => setForm({ ...form, garageAvailable: e.target.checked })}
          />
          Garage available
        </label>
        <Labeled label="Garage monthly cost ($)">
          <Input
            type="number"
            value={form.garageMonthlyCost ?? ''}
            onChange={(e) => setForm({ ...form, garageMonthlyCost: e.target.value })}
          />
        </Labeled>
        <Labeled label="Notes">
          <Textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Labeled>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function AmenitiesForm({ propertyId, value }: { propertyId: string; value?: AmenitiesValue }) {
  const [items, setItems] = useState<string[]>(value?.items ?? []);
  const [draft, setDraft] = useState('');
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => { void upsertKnowledge(propertyId, 'amenities', { items }); });
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Amenities</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Pool, Gym, Dog park"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => {
              if (draft.trim()) {
                setItems([...items, draft.trim()]);
                setDraft('');
              }
            }}
          >
            Add
          </Button>
        </div>
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded bg-zinc-950 px-3 py-2 text-sm"
            >
              <span>{item}</span>
              <button
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="text-zinc-500 hover:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function FaqsForm({ propertyId, value }: { propertyId: string; value?: FaqsValue }) {
  const [entries, setEntries] = useState<{ question: string; answer: string }[]>(
    value?.entries ?? [],
  );
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => { void upsertKnowledge(propertyId, 'faqs', { entries }); });
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Custom FAQs</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {entries.map((e, i) => (
          <div key={i} className="space-y-2 rounded border border-zinc-800 p-3">
            <Input
              placeholder="Question"
              value={e.question}
              onChange={(ev) => {
                const next = [...entries];
                next[i] = { ...next[i], question: ev.target.value };
                setEntries(next);
              }}
            />
            <Textarea
              placeholder="Answer"
              value={e.answer}
              onChange={(ev) => {
                const next = [...entries];
                next[i] = { ...next[i], answer: ev.target.value };
                setEntries(next);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEntries(entries.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setEntries([...entries, { question: '', answer: '' }])}
        >
          Add FAQ
        </Button>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
