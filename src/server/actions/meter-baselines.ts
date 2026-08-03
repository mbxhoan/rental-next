'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { sql } from '@/lib/db';
import { isCivilDate, type CivilDate } from '@/domain/date';
import { logAudit } from './audit';

export type MeterBaselineInput = {
  roomId: number;
  effectiveFrom: CivilDate;
  electricityReading: string;
};

export type MeterBaselineActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type ParsedBaseline = {
  roomId: number;
  effectiveFrom: CivilDate;
  electricityReading: number;
};

/**
 * Lưu các mốc điện đã được đối chiếu lại theo từng phòng.
 * Không cập nhật bills/bill_items, nên bill đã chốt luôn là chứng từ lịch sử.
 */
export async function saveMeterBaselines(
  input: MeterBaselineInput[],
): Promise<MeterBaselineActionResult> {
  const session = await requireRole('admin', 'staff');
  const rows = parseBaselines(input);
  if ('message' in rows) return rows;

  try {
    const roomIds = [...new Set(rows.map((row) => row.roomId))];
    const rooms = await sql<{ id: number; room_code: string }[]>`
      select id, room_code from rooms where id = any(${roomIds})
    `;
    const roomCodes = new Map(rooms.map((room) => [room.id, room.room_code]));
    if (roomCodes.size !== roomIds.length) {
      return { ok: false, message: 'Có phòng không còn tồn tại. Hãy tải lại trang rồi thử lại.' };
    }

    await sql.begin(async (tx) => {
      for (const row of rows) {
        const existing = await tx<{ electricity_reading: number; effective_from: CivilDate }[]>`
          select electricity_reading, effective_from
          from room_meter_baselines
          where room_id = ${row.roomId} and effective_from = ${row.effectiveFrom}
          for update
        `;

        await tx`
          insert into room_meter_baselines
            (room_id, effective_from, electricity_reading, note, created_by, created_at, updated_at)
          values
            (${row.roomId}, ${row.effectiveFrom}, ${row.electricityReading},
             'Mốc điện đã đối chiếu lại trước khi lên bill.', ${session.userId}, now(), now())
          on conflict (room_id, effective_from) do update set
            electricity_reading = excluded.electricity_reading,
            note = excluded.note,
            created_by = excluded.created_by,
            updated_at = now()
        `;
        // Cache giúp bản app cũ hiển thị đúng ngay, còn app mới luôn tra theo kỳ.
        await tx`
          update rooms
          set current_electricity_reading = ${row.electricityReading},
              electricity_reading_updated_at = now()
          where id = ${row.roomId}
        `;
        await logAudit(tx, {
          userId: session.userId,
          action: existing[0] ? 'meter_baseline.updated' : 'meter_baseline.created',
          subjectType: 'App\\Models\\Room',
          subjectId: row.roomId,
          oldValues: existing[0]
            ? { effective_from: existing[0].effective_from, electricity_reading: existing[0].electricity_reading }
            : null,
          newValues: { effective_from: row.effectiveFrom, electricity_reading: row.electricityReading },
          note: `Đặt mốc điện để lên bill tiếp theo cho phòng ${roomCodes.get(row.roomId)}.`,
        });
      }
    });
  } catch (error) {
    console.error('Không thể lưu mốc điện:', error);
    return { ok: false, message: databaseErrorMessage(error) };
  }

  revalidatePath('/bill-thang');
  revalidatePath('/so-do-phong');

  return { ok: true, message: `Đã cập nhật mốc điện cho ${rows.length} phòng. Bill đã chốt không bị thay đổi.` };
}

function parseBaselines(input: MeterBaselineInput[]): ParsedBaseline[] | MeterBaselineActionResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, message: 'Hãy nhập ít nhất một mốc điện cần cập nhật.' };
  }
  if (input.length > 100) {
    return { ok: false, message: 'Mỗi lần chỉ cập nhật tối đa 100 phòng.' };
  }

  const parsed: ParsedBaseline[] = [];
  const seen = new Set<string>();
  for (const row of input) {
    const reading = normalizeReading(row.electricityReading);
    if (!Number.isInteger(row.roomId) || row.roomId <= 0 || !isCivilDate(row.effectiveFrom) || reading === null) {
      return { ok: false, message: 'Có mốc điện không hợp lệ. Chỉ nhập số nguyên không âm.' };
    }
    const key = `${row.roomId}:${row.effectiveFrom}`;
    if (seen.has(key)) return { ok: false, message: 'Một phòng chỉ được cập nhật một lần cho cùng kỳ.' };
    seen.add(key);
    parsed.push({ roomId: row.roomId, effectiveFrom: row.effectiveFrom, electricityReading: reading });
  }
  return parsed;
}

function normalizeReading(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function databaseErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  if (code === '42P01') {
    return 'Chưa thể lưu mốc điện vì cơ sở dữ liệu chưa được cập nhật. Hãy liên hệ quản trị viên.';
  }

  return 'Không thể lưu mốc điện vào cơ sở dữ liệu. Hãy thử lại; nếu vẫn lỗi, liên hệ quản trị viên.';
}
