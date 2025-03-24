import { PoolConnection } from 'mysql2/promise';
import { ApiLog, DatabaseError } from '../types';

export async function insertApiLog(conn: PoolConnection, apiLog: ApiLog) {
  try {
    await conn.query(
      `
      INSERT INTO api_logs (uri, method)
      VALUES (?, ?);
      `,
      [apiLog.uri, apiLog.method]
    );
  } catch (error: any) {
    throw new DatabaseError('Failed to store api log');
  }
}
