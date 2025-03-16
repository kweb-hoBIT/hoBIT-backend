import { NextFunction, Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import { Pool } from '../../config/connectDB';
import { insertApiLog } from '../db_interface';

export const logApi = async (
	req: Request,
	_res: Response,
	next: NextFunction
) => {
	const conn: PoolConnection = await Pool.getConnection();
	try {
		await insertApiLog(conn, {
			uri: req.originalUrl,
			method: req.method.toLowerCase(),
		});
	} finally {
		conn.release();
		next();
	}
};
