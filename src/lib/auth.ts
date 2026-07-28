import 'server-only';
import { compare } from 'bcryptjs';
import { redirect } from 'next/navigation';
import { sql } from './db';
import { readSession, type SessionPayload } from './session';
import type { UserRole } from '@/domain/enums';

/**
 * Xác thực dựa trên bảng `users` trong Supabase Postgres.
 *
 * Hỗ trợ bcrypt tiền tố `$2y$` để giữ nguyên tài khoản hiện có.
 */

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
};

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === '' || password === '') return null;

  const rows = await sql<
    { id: number; name: string; email: string; role: string; password: string }[]
  >`
    select id, name, email, role, password
    from users
    where lower(email) = ${normalizedEmail}
    limit 1
  `;

  const user = rows[0];

  // So sánh cả khi không tìm thấy user để thời gian phản hồi không tiết lộ
  // email nào có tồn tại trong hệ thống.
  const hash = user?.password ?? '$2y$12$0000000000000000000000000000000000000000000000000000';
  const matched = await compare(password, hash);

  if (!user || !matched) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role as UserRole };
}

/** Bắt buộc đăng nhập. Chưa đăng nhập → về trang login. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect('/dang-nhap');
  return session;
}

/**
 * Bắt buộc đăng nhập và đúng quyền.
 *
 * Dùng redirect thay cho `forbidden()` vì hàm đó còn nằm sau cờ experimental
 * `authInterrupts` — không đáng bật cờ thử nghiệm cho app đang chạy thật.
 */
export async function requireRole(...allowed: UserRole[]): Promise<SessionPayload> {
  const session = await requireUser();
  if (!allowed.includes(session.role)) redirect('/khong-du-quyen');
  return session;
}
