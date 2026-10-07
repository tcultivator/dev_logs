import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2";
import { execute, getPool, query, SqlParamMap } from "@/lib/db";
import {
  EntryType,
  TicketStatus,
  isTicketType,
} from "@/lib/entries";

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
  status: TicketStatus | null;
  resolved_at: Date | string | null;
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
  status: TicketStatus | null;
  resolvedAt: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; description: string | null } | null;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null | undefined) {
  if (value == null) return null;
  return toIso(value);
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
  const status = isTicketType(row.type) ? row.status : null;
  const done = status === "DONE" || Boolean(row.done);
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    tags: row.tags,
    done,
    status,
    resolvedAt: toIsoOrNull(row.resolved_at),
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

export async function listProjects(userId: string) {
  const rows = await query<ProjectRow[]>(
    `SELECT p.*,
            (SELECT COUNT(*) FROM entries e WHERE e.project_id = p.id AND e.user_id = :userId) AS entry_count
     FROM projects p
     WHERE p.user_id = :userId
     ORDER BY p.name ASC`,
    { userId }
  );
  return rows.map(mapProject);
}

export async function getOwnedProject(userId: string, id: string) {
  const rows = await query<ProjectRow[]>(
    `SELECT p.*, 0 AS entry_count
     FROM projects p
     WHERE p.id = :id AND p.user_id = :userId`,
    { id, userId }
  );
  return rows[0] ? mapProject(rows[0]) : null;
}

export async function createProject(
  userId: string,
  name: string,
  description: string | null
) {
  const id = newId();
  await execute(
    `INSERT INTO projects (id, user_id, name, description)
     VALUES (:id, :userId, :name, :description)`,
    { id, userId, name, description }
  );
  const rows = await query<ProjectRow[]>(
    `SELECT p.*, 0 AS entry_count FROM projects p WHERE p.id = :id`,
    { id }
  );
  return mapProject(rows[0]);
}

export async function deleteProject(userId: string, id: string) {
  const result = await execute(
    `DELETE FROM projects WHERE id = :id AND user_id = :userId`,
    { id, userId }
  );
  return result.affectedRows > 0;
}

async function requireOwnedProject(userId: string, projectId: string | null) {
  if (!projectId) return;
  const project = await getOwnedProject(userId, projectId);
  if (!project) {
    const error = new Error("PROJECT_NOT_FOUND");
    throw error;
  }
}

export async function getEntry(userId: string, id: string) {
  const rows = await query<EntryRow[]>(
    `SELECT e.*,
            p.name AS project_name,
            p.description AS project_description
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id AND p.user_id = :userId
     WHERE e.id = :id AND e.user_id = :userId`,
    { id, userId }
  );
  return rows[0] ? mapEntry(rows[0]) : null;
}

export async function listEntries(filters: {
  userId: string;
  q?: string;
  type?: string;
  status?: TicketStatus | TicketStatus[];
  projectId?: string;
  from?: Date;
  to?: Date;
  dateField?: "created_at" | "resolved_at";
}) {
  const clauses: string[] = ["e.user_id = :userId"];
  const params: Record<string, string | number | Date> = {
    userId: filters.userId,
  };

  if (filters.type) {
    clauses.push("e.type = :type");
    params.type = filters.type;
  }
  if (filters.status) {
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    if (statuses.length === 1) {
      clauses.push("e.status = :status");
      params.status = statuses[0];
    } else if (statuses.length > 1) {
      const keys = statuses.map((_, i) => `:status${i}`);
      statuses.forEach((s, i) => {
        params[`status${i}`] = s;
      });
      clauses.push(`e.status IN (${keys.join(", ")})`);
    }
  }
  if (filters.projectId) {
    clauses.push("e.project_id = :projectId");
    params.projectId = filters.projectId;
  }
  if (filters.from && filters.to) {
    const field =
      filters.dateField === "resolved_at" ? "e.resolved_at" : "e.created_at";
    clauses.push(`${field} >= :from AND ${field} <= :to`);
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
  const orderField =
    filters.dateField === "resolved_at" ? "e.resolved_at" : "e.created_at";

  const rows = await query<EntryRow[]>(
    `SELECT e.*,
            p.name AS project_name,
            p.description AS project_description
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id AND p.user_id = :userId
     ${where}
     ORDER BY ${orderField} DESC`,
    params
  );

  return rows.map(mapEntry);
}

function ticketFieldsForType(
  type: EntryType,
  status?: TicketStatus | null,
  when: Date = new Date()
): { status: TicketStatus | null; done: number; resolvedAt: Date | null } {
  if (!isTicketType(type)) {
    return { status: null, done: 0, resolvedAt: null };
  }
  const nextStatus = status ?? "OPEN";
  return {
    status: nextStatus,
    done: nextStatus === "DONE" ? 1 : 0,
    resolvedAt: nextStatus === "DONE" ? when : null,
  };
}

export async function createEntry(input: {
  userId: string;
  title: string;
  body: string;
  type: EntryType;
  tags: string | null;
  projectId: string | null;
  status?: TicketStatus | null;
  loggedOn?: Date | null;
}) {
  await requireOwnedProject(input.userId, input.projectId);
  const id = newId();
  const when = input.loggedOn ?? new Date();
  const ticket = ticketFieldsForType(input.type, input.status, when);

  await execute(
    `INSERT INTO entries (id, user_id, title, body, type, tags, done, status, resolved_at, project_id, created_at)
     VALUES (:id, :userId, :title, :body, :type, :tags, :done, :status, :resolvedAt, :projectId, :createdAt)`,
    {
      id,
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      tags: input.tags,
      done: ticket.done,
      status: ticket.status,
      resolvedAt: ticket.resolvedAt,
      projectId: input.projectId,
      createdAt: when,
    }
  );

  const rows = await query<EntryRow[]>(
    `SELECT e.*,
            p.name AS project_name,
            p.description AS project_description
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id AND p.user_id = :userId
     WHERE e.id = :id AND e.user_id = :userId`,
    { id, userId: input.userId }
  );
  return mapEntry(rows[0]);
}

export async function updateEntry(
  userId: string,
  id: string,
  data: Partial<{
    title: string;
    body: string;
    type: EntryType;
    tags: string | null;
    done: boolean;
    status: TicketStatus | null;
    projectId: string | null;
    loggedOn: Date;
  }>
) {
  const current = await getEntry(userId, id);
  if (!current) return null;

  if (data.projectId) await requireOwnedProject(userId, data.projectId);

  const fields: string[] = [];
  const params: SqlParamMap = { id, userId };

  if (data.title !== undefined) {
    fields.push("title = :title");
    params.title = data.title;
  }
  if (data.body !== undefined) {
    fields.push("body = :body");
    params.body = data.body;
  }
  if (data.tags !== undefined) {
    fields.push("tags = :tags");
    params.tags = data.tags;
  }
  if (data.projectId !== undefined) {
    fields.push("project_id = :projectId");
    params.projectId = data.projectId;
  }

  const nextType = data.type ?? current.type;
  const touchingTicketState =
    data.type !== undefined ||
    data.status !== undefined ||
    data.done !== undefined;
  const explicitWhen = data.loggedOn;

  if (explicitWhen) {
    fields.push("created_at = :createdAt");
    params.createdAt = explicitWhen;
  }

  if (data.type !== undefined) {
    fields.push("type = :type");
    params.type = data.type;
  }

  if (touchingTicketState) {
    let nextStatus: TicketStatus | null = current.status;

    if (data.status !== undefined) {
      nextStatus = data.status;
    } else if (data.done !== undefined && isTicketType(nextType)) {
      if (data.done) nextStatus = "DONE";
      else if (current.status === "DONE") nextStatus = "OPEN";
      else nextStatus = current.status ?? "OPEN";
    } else if (data.type !== undefined && !isTicketType(data.type)) {
      nextStatus = null;
    } else if (
      data.type !== undefined &&
      isTicketType(data.type) &&
      !current.status
    ) {
      nextStatus = "OPEN";
    }

    if (isTicketType(nextType)) {
      const status = nextStatus ?? "OPEN";
      fields.push("status = :status");
      params.status = status;
      fields.push("done = :done");
      params.done = status === "DONE" ? 1 : 0;

      if (status === "DONE") {
        if (explicitWhen) {
          fields.push("resolved_at = :resolvedAt");
          params.resolvedAt = explicitWhen;
        } else {
          fields.push("resolved_at = COALESCE(resolved_at, :resolvedAt)");
          params.resolvedAt = new Date();
        }
      } else {
        fields.push("resolved_at = NULL");
      }
    } else {
      fields.push("status = NULL");
      fields.push("resolved_at = NULL");
      fields.push("done = 0");
    }
  } else if (
    explicitWhen &&
    isTicketType(nextType) &&
    current.status === "DONE"
  ) {
    fields.push("resolved_at = :resolvedAt");
    params.resolvedAt = explicitWhen;
  }

  if (!fields.length) return getEntry(userId, id);

  const result = await execute(
    `UPDATE entries SET ${fields.join(", ")} WHERE id = :id AND user_id = :userId`,
    params
  );
  if (result.affectedRows === 0) return null;

  return getEntry(userId, id);
}

export async function deleteEntry(userId: string, id: string) {
  const result = await execute(
    `DELETE FROM entries WHERE id = :id AND user_id = :userId`,
    { id, userId }
  );
  return result.affectedRows > 0;
}

export async function countUnassigned() {
  const rows = await query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM projects WHERE user_id IS NULL) AS projects,
       (SELECT COUNT(*) FROM entries WHERE user_id IS NULL) AS entries`
  );
  return {
    projects: Number(rows[0]?.projects ?? 0),
    entries: Number(rows[0]?.entries ?? 0),
  };
}

export async function claimUnassigned(userId: string) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE projects SET user_id = ? WHERE user_id IS NULL`,
      [userId]
    );
    await connection.query(
      `UPDATE entries SET user_id = ? WHERE user_id IS NULL`,
      [userId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
