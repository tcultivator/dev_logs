import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2";
import { execute, query, SqlParamMap } from "@/lib/db";
import { EntryType } from "@/lib/entries";

export type ProjectRow = RowDataPacket & {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  entry_count?: number;
};

export type EntryRow = RowDataPacket & {
  id: string;
  title: string;
  body: string;
  type: EntryType;
  tags: string | null;
  done: number | boolean;
  project_id: string | null;
  created_at: Date;
  updated_at: Date;
  project_name?: string | null;
  project_description?: string | null;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { entries: number };
};

export type Entry = {
  id: string;
  title: string;
  body: string;
  type: EntryType;
  tags: string | null;
  done: boolean;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; description: string | null } | null;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    _count: { entries: Number(row.entry_count ?? 0) },
  };
}

export function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    tags: row.tags,
    done: Boolean(row.done),
    projectId: row.project_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    project: row.project_id
      ? {
          id: row.project_id,
          name: row.project_name || "",
          description: row.project_description ?? null,
        }
      : null,
  };
}

export function newId() {
  return randomUUID();
}

export async function listProjects() {
  const rows = await query<ProjectRow[]>(
    `SELECT p.*,
            (SELECT COUNT(*) FROM entries e WHERE e.project_id = p.id) AS entry_count
     FROM projects p
     ORDER BY p.name ASC`
  );
  return rows.map(mapProject);
}

export async function createProject(name: string, description: string | null) {
  const id = newId();
  await execute(
    `INSERT INTO projects (id, name, description) VALUES (:id, :name, :description)`,
    { id, name, description }
  );
  const rows = await query<ProjectRow[]>(
    `SELECT p.*, 0 AS entry_count FROM projects p WHERE p.id = :id`,
    { id }
  );
  return mapProject(rows[0]);
}

export async function deleteProject(id: string) {
  const result = await execute(`DELETE FROM projects WHERE id = :id`, { id });
  return result.affectedRows > 0;
}

export async function listEntries(filters: {
  q?: string;
  type?: string;
  projectId?: string;
  from?: Date;
  to?: Date;
}) {
  const clauses: string[] = [];
  const params: Record<string, string | number | Date> = {};

  if (filters.type) {
    clauses.push("e.type = :type");
    params.type = filters.type;
  }
  if (filters.projectId) {
    clauses.push("e.project_id = :projectId");
    params.projectId = filters.projectId;
  }
  if (filters.from && filters.to) {
    clauses.push("e.created_at >= :from AND e.created_at <= :to");
    params.from = filters.from;
    params.to = filters.to;
  }
  if (filters.q) {
    clauses.push(
      "(e.title LIKE :q OR e.body LIKE :q OR IFNULL(e.tags, '') LIKE :q)"
    );
    params.q = `%${filters.q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = await query<EntryRow[]>(
    `SELECT e.*,
            p.name AS project_name,
            p.description AS project_description
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id
     ${where}
     ORDER BY e.created_at DESC`,
    params
  );

  return rows.map(mapEntry);
}

export async function createEntry(input: {
  title: string;
  body: string;
  type: EntryType;
  tags: string | null;
  projectId: string | null;
}) {
  const id = newId();
  await execute(
    `INSERT INTO entries (id, title, body, type, tags, project_id)
     VALUES (:id, :title, :body, :type, :tags, :projectId)`,
    {
      id,
      title: input.title,
      body: input.body,
      type: input.type,
      tags: input.tags,
      projectId: input.projectId,
    }
  );

  const rows = await query<EntryRow[]>(
    `SELECT e.*,
            p.name AS project_name,
            p.description AS project_description
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id
     WHERE e.id = :id`,
    { id }
  );
  return mapEntry(rows[0]);
}

export async function updateEntry(
  id: string,
  data: Partial<{
    title: string;
    body: string;
    type: EntryType;
    tags: string | null;
    done: boolean;
    projectId: string | null;
  }>
) {
  const fields: string[] = [];
  const params: SqlParamMap = { id };

  if (data.title !== undefined) {
    fields.push("title = :title");
    params.title = data.title;
  }
  if (data.body !== undefined) {
    fields.push("body = :body");
    params.body = data.body;
  }
  if (data.type !== undefined) {
    fields.push("type = :type");
    params.type = data.type;
  }
  if (data.tags !== undefined) {
    fields.push("tags = :tags");
    params.tags = data.tags;
  }
  if (data.done !== undefined) {
    fields.push("done = :done");
    params.done = data.done ? 1 : 0;
  }
  if (data.projectId !== undefined) {
    fields.push("project_id = :projectId");
    params.projectId = data.projectId;
  }

  if (!fields.length) return null;

  const result = await execute(
    `UPDATE entries SET ${fields.join(", ")} WHERE id = :id`,
    params
  );
  if (result.affectedRows === 0) return null;

  const rows = await query<EntryRow[]>(
    `SELECT e.*,
            p.name AS project_name,
            p.description AS project_description
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id
     WHERE e.id = :id`,
    { id }
  );
  return rows[0] ? mapEntry(rows[0]) : null;
}

export async function deleteEntry(id: string) {
  const result = await execute(`DELETE FROM entries WHERE id = :id`, { id });
  return result.affectedRows > 0;
}
