import Link from 'next/link';
import { Building2, Home, MessageSquare, Users } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/guest-cards', label: 'Guest cards', icon: Users },
  { href: '/properties', label: 'Properties', icon: Building2 },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-8 px-2 text-lg font-semibold">OmniLease</div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-50"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
