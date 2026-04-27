import Link from 'next/link';
import { db, eq, desc, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default async function PropertiesPage() {
  const { orgId } = await requireOrg();
  const rows = await db
    .select()
    .from(properties)
    .where(eq(properties.orgId, orgId))
    .orderBy(desc(properties.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Properties</h1>
        <Button nativeButton={false} render={<Link href="/properties/new">New property</Link>} />
      </div>

      {rows.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="mb-4 text-zinc-400">No properties yet.</p>
            <Button nativeButton={false} render={<Link href="/properties/new">Add your first property</Link>} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <Link key={p.id} href={`/properties/${p.id}`}>
              <Card className="border-zinc-800 bg-zinc-900 transition hover:border-zinc-700">
                <CardContent className="p-4">
                  <div className="font-medium">{p.name}</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
