import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2";
import { execute, query } from "@/lib/db";
import {
  ReportFormat,
  ReportFormatInput,
  formatConfig,
  parseReportFormat,
} from "@/lib/report-format";

type FormatRow = RowDataPacket & {
  id: string;
  name: string;
  config: string;
};

export async function listReportFormats(userId: string) {
  const rows = await query<FormatRow[]>(
    `SELECT id, name, config
     FROM report_formats
     WHERE user_id = :userId
     ORDER BY created_at ASC`,
    { userId }
  );

  const formats: ReportFormat[] = [];
  for (const row of rows) {
    let stored: ReportFormatInput = {};
    try {
      stored = JSON.parse(row.config) as ReportFormatInput;
    } catch {
      continue;
    }
    const parsed = parseReportFormat({ ...stored, name: row.name }, row.id, false);
    if (parsed.ok) formats.push(parsed.format);
  }
  return formats;
}

export async function createReportFormat(userId: string, input: ReportFormatInput) {
  const parsed = parseReportFormat(input, randomUUID(), false);
  if (!parsed.ok) return parsed;

  await execute(
    `INSERT INTO report_formats (id, user_id, name, config)
     VALUES (:id, :userId, :name, :config)`,
    {
      id: parsed.format.id,
      userId,
      name: parsed.format.name,
      config: JSON.stringify(formatConfig(parsed.format)),
    }
  );

  return parsed;
}

export async function deleteReportFormat(userId: string, id: string) {
  const result = await execute(
    `DELETE FROM report_formats WHERE id = :id AND user_id = :userId`,
    { id, userId }
  );
  return result.affectedRows > 0;
}
