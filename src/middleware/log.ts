import { NextFunction, Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import { Pool } from '../../config/connectDB';
import { insertApiLog } from '../db_interface';

export const logApi = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  let conn: PoolConnection | null = null;
  try {
    conn = await Pool.getConnection();
    await insertApiLog(conn, {
      uri: req.originalUrl,
      method: req.method.toLowerCase(),
    });
  } catch (err) {
    console.error('[logApi] failed to write api log:', err);
  } finally {
    if (conn) conn.release();
    next();
  }
};
