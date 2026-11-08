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

	const { department, major_type, grade, admission_year, student_status, language,
		grad_department, degree, grad_admission_year } = req.body;

	const ragRes = await axios.post(
		`${RAG_SERVER_URL}/profile`,
		{ session_id: sessionId, department, major_type, grade, admission_year, student_status, language,
		  grad_department, degree, grad_admission_year },  // 대학원 정보는 학부 정보와 따로 저장
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

/**
 * 프로필 선택지 — 학과·전공 유형·학적 상태(관리자 사이트 '프로필 항목'), 학년, 학번(올해 기준 자동)
 * RAG가 DB를 1분 캐시로 읽음. 화면도 1분 캐시
 */
export const getProfileOptions = async (_req: Request, res: Response) => {
	const ragRes = await axios.get(`${RAG_SERVER_URL}/profile/options`, { timeout: 5000 });
	res.set('Cache-Control', 'public, max-age=60');
	res.status(200).json(ragRes.data);
};

/** 대화 시작 화면 '곧 마감되는 공지' — 학부 공지·장학 중 7일 안에 마감 (프로필이 있으면 대상이 맞는 것만) */
export const getClosingNotices = async (req: Request, res: Response) => {
	try {
		const sessionId = req.headers['x-session-id'] as string | undefined;
		const ragRes = await axios.get(`${RAG_SERVER_URL}/notices/closing`, {
			params: { days: 7, limit: 4, program: req.query?.['program'] === 'graduate' ? 'graduate' : 'undergraduate' },
			headers: sessionId ? { 'X-Session-ID': sessionId } : {},
			timeout: 3000,
		});
		res.status(200).json(ragRes.data);
	} catch (error: any) {
		console.warn('[ClosingNotices] 실패:', error?.message ?? error);
		res.status(200).json({ items: [] }); // 없어도 시작 화면은 정상
	}
};
