import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import {
	AllSeniorFaqsResponse,
	ErrorResponse,
	SeniorFaqResponse,
} from '../types/seniorFaq';
import { Pool } from '../../config/connectDB';
import {
	fetchAllSeniorFaqs,
	fetchSeniorFaqById,
} from '../db_interface/seniorFaq';

export const allSeniorFaqs = async (
	_req: Request,
	res: Response<AllSeniorFaqsResponse | ErrorResponse>
) => {
	const conn: PoolConnection = await Pool.getConnection();

	try {
		const seniorFaqs = await fetchAllSeniorFaqs(conn);
		res.json({ seniorFaqs });
	} finally {
		conn.release();
	}
};

export type seniorFaqIdQueryParams = {
	id: number;
};

export const seniorFaqById = async (
	req: Request,
	res: Response<SeniorFaqResponse | ErrorResponse>
) => {
	const conn: PoolConnection = await Pool.getConnection();
	const id = parseInt(req.query['id'] as string);

	try {
		const seniorFaq = await fetchSeniorFaqById(conn, id);
		res.json({ seniorFaq });
	} finally {
		conn.release();
	}
};
