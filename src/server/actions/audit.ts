import 'server-only';
import type { JSONValue, Sql, TransactionSql } from 'postgres';

/**
 * Ghi audit log vào cùng bảng `audit_logs` mà Laravel dùng.
 *
 * `subject_type` giữ nguyên tên class PHP (vd `App\Models\Bill`) để màn Nhật ký
 * bên Laravel đọc được log do app Next ghi ra, và ngược lại.
 */

export type AuditEntry = {
  userId: number | null;
  action: string;
  subjectType?: string | null;
  subjectId?: number | null;
  oldValues?: Record<string, JSONValue> | null;
  newValues?: Record<string, JSONValue> | null;
  note?: string | null;
};

export async function logAudit(
  db: Sql | TransactionSql,
  entry: AuditEntry,
): Promise<void> {
  await db`
    insert into audit_logs
      (user_id, action, subject_type, subject_id, old_values, new_values,
       ip_address, user_agent, note, created_at)
    values
      (${entry.userId}, ${entry.action}, ${entry.subjectType ?? null}, ${entry.subjectId ?? null},
       ${entry.oldValues ? db.json(entry.oldValues) : null},
       ${entry.newValues ? db.json(entry.newValues) : null},
       null, 'rental-next', ${entry.note ?? null}, now())
  `;
}
