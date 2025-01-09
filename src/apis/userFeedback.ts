import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import {
	DirectUserFeedbackRequest,
	DirectUserFeedbackResponse,
} from '../types/feedback';
import { Pool } from '../../config/connectDB';
import { insertUserFeedback } from '../db_interface/userFeedback';
import { ErrorResponse } from '../types';

export const directUserFeedback = async (
	req: Request<DirectUserFeedbackRequest>,
	res: Response<DirectUserFeedbackResponse | ErrorResponse>
) => {
	const { feedback_detail, language } = req.body;
	const conn: PoolConnection = await Pool.getConnection();

	const feedback = {
		feedback_detail,
		language,
		faq_id: null,
		feedback_reason: null,
	};

	try {
		await insertUserFeedback(conn, feedback);
		res.json({ success: true });
	} finally {
		conn.release();
	}
};
