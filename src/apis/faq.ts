import axios from 'axios';
import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';

import { AllFaqsResponse, AllQuestionsResponse, ErrorResponse, ValidationError } from '../types';
import { Pool } from '../../config/connectDB';
import { envs } from '../envs';
import { fetchAllFaqs, fetchAllQuestions, fetchTopFaqs, fetchFaqByFaqIds } from '../db_interface';

export const allFaqs = async (
	_req: Request,
	res: Response<AllFaqsResponse | ErrorResponse>
) => {
	const conn: PoolConnection = await Pool.getConnection();

	try {
		const faqs = await fetchAllFaqs(conn);
		res.json({ faqs });
	} finally {
		conn.release();
	}
};

export const allQuestions = async (
	_req: Request,
	res: Response<AllQuestionsResponse | ErrorResponse>
) => {
	const conn: PoolConnection = await Pool.getConnection();

	try {
		const questions = await fetchAllQuestions(conn);
		res.json({ questions });
	} finally {
		conn.release();
	}
};

const TOP_FAQ_COUNT = 5;
const RAG_SERVER_URL = envs.RAG_SERVER_URL ?? 'http://localhost:8000';

async function popularFaqIds(): Promise<number[]> {
	try {
		const ragRes = await axios.get(`${RAG_SERVER_URL}/recommend/start`, { params: { n: 10 }, timeout: 2000 });
		return (ragRes.data.items ?? []).map((it: any) => it.faq_id).filter((id: any) => Number.isInteger(id));
	} catch {
		return [];
	}
}

export const topFaqs = async (
	_req: Request,
	res: Response<AllFaqsResponse | ErrorResponse>
) => {
	const conn: PoolConnection = await Pool.getConnection();

	try {
		const topFaqs = await fetchTopFaqs(conn, TOP_FAQ_COUNT);
		// 최근 한 달 클릭 기록이 부족하면(서비스 초기·로그 초기화 직후) 추천 풀의 시작 화면 인기 질문 중
		// 행정실 FAQ가 있는 것으로 채움 — 목록이 비지 않게
		if (topFaqs.length < TOP_FAQ_COUNT) {
			const have = new Set(topFaqs.map((f) => f.id));
			const fillIds = (await popularFaqIds()).filter((id) => !have.has(id)).slice(0, TOP_FAQ_COUNT - topFaqs.length);
			if (fillIds.length) topFaqs.push(...(await fetchFaqByFaqIds(conn, fillIds)));
		}
		res.json({ faqs: topFaqs });
	} finally {
		conn.release();
	}
};

export const faqById = async (
	req: Request,
	res: Response<AllFaqsResponse | ErrorResponse>
) => {
	const id = parseInt(req.query['id'] as string, 10);
	if (isNaN(id)) {
		throw new ValidationError("invalid parameter, 'id' must be a number");
	}

	const conn: PoolConnection = await Pool.getConnection();

	try {
		const faqs = await fetchFaqByFaqIds(conn, [id]);
		res.json({ faqs });
	} finally {
		conn.release();
	}
};
