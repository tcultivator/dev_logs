import mysql, {
  Pool,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var mysqlPool: Pool | undefined;
}

type SqlParamValue = string | number | boolean | Date | Buffer | null | undefined;
export type SqlParamMap = Record<string, SqlParamValue>;
export type SqlParams = SqlParamValue[] | SqlParamMap;

function createPool() {
  return mysql.createPool({
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "devlog",
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
  });
}

export function getPool() {
  if (!global.mysqlPool) {
    global.mysqlPool = createPool();
  }
  return global.mysqlPool;
}

export type { ResultSetHeader, RowDataPacket };

export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: SqlParams
) {
  // Cast avoids mysql2 overload mismatch with named placeholder objects
  const [rows] = await getPool().query<T>(sql, params as SqlParamValue[]);
  return rows;
}

export async function execute(sql: string, params?: SqlParams) {
  const [result] = await getPool().query<ResultSetHeader>(
    sql,
    params as SqlParamValue[]
  );
  return result;
}
