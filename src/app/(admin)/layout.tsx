import { Nav } from '@/components/nav';
import { requireUser } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();

  return (
    <div className="min-h-screen">
      <Nav role={session.role} userName={session.name} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
