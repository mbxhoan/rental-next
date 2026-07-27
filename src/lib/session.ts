import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { UserRole } from '@/domain/enums';

/**
 * Phiên đăng nhập riêng của app Next (cookie JWT ký bằng SESSION_SECRET).
 *
 * Không dùng chung session với Laravel: payload session của Laravel là chuỗi
 * PHP-serialize mã hoá bằng APP_KEY, đọc lại bên JS rất phiền và dễ vỡ. Hai
 * app chỉ dùng chung bảng `users`, ai đăng nhập app nào thì giữ phiên app đó.
 */

const SESSION_COOKIE = 'rental_session';
const SESSION_DAYS = 7;

const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error('Thiếu biến môi trường SESSION_SECRET.');
}

const encodedKey = new TextEncoder().encode(secret);

export type SessionPayload = {
  userId: number;
  role: UserRole;
  name: string;
};

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(encodedKey);
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'number' || typeof payload.role !== 'string') return null;

    return {
      userId: payload.userId,
      role: payload.role as UserRole,
      name: String(payload.name ?? ''),
    };
  } catch {
    return null;
  }
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await encryptSession(payload);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decryptSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
