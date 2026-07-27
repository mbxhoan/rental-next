import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { destroySession } from '@/lib/session';

export async function POST(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL('/dang-nhap', request.url), { status: 303 });
}
