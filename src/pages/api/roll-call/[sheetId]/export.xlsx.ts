import type { APIRoute } from 'astro';
import ExcelJS from 'exceljs';
import { audit, getRollCallData } from '@/lib/yk';
import { requireEditor } from '@/lib/yk-api';
import { formatDate, formatDateTime } from '@/lib/yk-format';

export const GET: APIRoute = async (context) => {
  const user = requireEditor(context);
  const data = await getRollCallData(String(context.params.sheetId));
  if (!data) return new Response('Not found', { status: 404 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SUOyuncuları YK';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(data.sheet.name.slice(0, 31) || 'Yoklama');

  const headers = ['Üye', ...data.rehearsals.map((rehearsal) => formatDate(rehearsal.rehearsal_date)), 'Toplam'];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  const entryMap = new Map(data.entries.map((entry) => [`${entry.member_id}:${entry.rehearsal_id}`, entry]));
  for (const member of data.members) {
    sheet.addRow([
      member.display_name,
      ...data.rehearsals.map((rehearsal) => entryMap.get(`${member.id}:${rehearsal.id}`)?.label || ''),
      data.totals[member.id] ?? 0,
    ]);
  }

  sheet.addRow([]);
  sheet.addRow(['Ortalama puan', data.average]);
  sheet.addRow(['Dışa aktaran', user.email]);
  sheet.addRow(['Dışa aktarma zamanı', formatDateTime(new Date().toISOString())]);
  sheet.columns.forEach((column) => {
    column.width = Math.max(14, Math.min(28, column.width || 14));
  });

  await audit({ user, request: context.request }, 'export', 'yk_roll_call_sheets', data.sheet.id, null, {
    sheet: data.sheet.name,
    format: 'xlsx',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${encodeURIComponent(data.sheet.name)}-yoklama.xlsx"`,
    },
  });
};
