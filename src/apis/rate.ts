import { PoolConnection } from 'mysql2/promise';
import { Request, Response, NextFunction } from 'express';
import { updateFaqLogRate } from '../db_interface';
import {
	ErrorResponse,
	RateFaqRequest,
	RateFaqResponse,
	ValidationError,
} from '../types';
import { Pool } from '../../config/connectDB';
import { insertUserFeedback } from '../db_interface/userFeedback';

export const rateFaq = async (
	req: Request<RateFaqRequest>,
	res: Response<RateFaqResponse | ErrorResponse>,
	next: NextFunction
) => {
	const { faq_id, user_question, rate, language } = req.body;

	if (!faq_id || rate === undefined) {
		throw new ValidationError('faq_id와 rate는 필수 값입니다.');
	}

	const conn: PoolConnection = await Pool.getConnection();

	try {
		await conn.beginTransaction();

		await updateFaqLogRate(conn, faq_id, rate);

		let feedback_reason = null;
		let feedback_detail = `Unresolved question: ${user_question}`;

		if (rate === -1) {
			await insertUserFeedback(conn, {
				feedback_reason,
				feedback_detail,
				language,
			});
		}

		await conn.commit();

		res.json({ success: true });
	} catch (error: any) {
		await conn.rollback();
		next(error);
	} finally {
		conn.release();
	}
};
