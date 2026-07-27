import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';

export default async function HomePage() {
  redirect((await readSession()) ? '/dashboard' : '/dang-nhap');
}
