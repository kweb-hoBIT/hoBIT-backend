import { Request, Response } from 'express';
import axios from 'axios';

import { ErrorResponse, ValidationError } from '../types';
import { envs } from '../envs';

const RAG_SERVER_URL = envs.RAG_SERVER_URL ?? 'http://localhost:8000';

export const saveProfile = async (
	req: Request,
	res: Response<{ status: string } | ErrorResponse>
) => {
	const sessionId = req.headers['x-session-id'] as string | undefined;
	if (!sessionId) {
		throw new ValidationError("X-Session-ID header is required");
	}

	const { department, major_type, grade, admission_year, student_status, language } = req.body;

	const ragRes = await axios.post(
		`${RAG_SERVER_URL}/profile`,
		{ session_id: sessionId, department, major_type, grade, admission_year, student_status, language },
		{ headers: { 'X-Session-ID': sessionId } }
	);

	res.status(200).json(ragRes.data);
};

const requireSession = (req: Request): string => {
	const sessionId = req.headers['x-session-id'] as string | undefined;
	if (!sessionId) throw new ValidationError('X-Session-ID header is required');
	return sessionId;
};

/** 화면의 '내 정보' — 저장된 프로필과 남은 보관 시간 */
export const getProfile = async (req: Request, res: Response) => {
	const sessionId = requireSession(req);
	const ragRes = await axios.get(`${RAG_SERVER_URL}/profile`, { headers: { 'X-Session-ID': sessionId } });
	res.status(200).json(ragRes.data);
};

/** 프로필 삭제 — ?field=department 처럼 항목 하나, 없으면 전체 (대화 기록 포함) */
export const deleteProfile = async (req: Request, res: Response) => {
	const sessionId = requireSession(req);
	const field = typeof req.query['field'] === 'string' ? req.query['field'] : undefined;
	const ragRes = await axios.delete(`${RAG_SERVER_URL}/profile`, {
		headers: { 'X-Session-ID': sessionId },
		params: field ? { field } : {},
		validateStatus: (s) => s < 500,
	});
	res.status(ragRes.status).json(ragRes.data);
};
