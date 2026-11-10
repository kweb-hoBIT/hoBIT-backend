import { Request, Response } from 'express';
import axios from 'axios';
import { envs } from '../envs';
import { screenQuestion } from '../middleware/abuse';
import {
  ChatRequest,
  ChatResponse,
  ErrorResponse,
  ValidationError,
} from '../types';

// hoBIT RAG 서버 URL (환경변수 없으면 로컬 기본값)
const RAG_SERVER_URL = envs.RAG_SERVER_URL ?? 'http://localhost:8000';

export const chat = async (
  req: Request<{}, {}, ChatRequest>,
  res: Response<ChatResponse | ErrorResponse>
) => {
  const { message, language } = req.body;

  // 입력 검증
  if (!message) {
    throw new ValidationError("invalid parameter, 'message' required");
  } else if (!language) {
    throw new ValidationError("invalid parameter, 'language' required");
  }

  // 예전 단순 채팅 API (현재 화면에서는 안 씀) — 열려 있는 동안 /question과 같은 횟수 제한·경고·정지를 거쳐 LLM 비용이 새지 않게
  const gate = screenQuestion({ text: message, ip: req.ip, sessionId: req.headers['x-session-id'] as string | undefined });
  if (gate) {
    res.status(200).json({ response: language === 'EN' ? gate.message.en : gate.message.ko, conversation_id: 'blocked' });
    return;
  }

  try {
    // hoBIT RAG 서버 호출
    const ragRes = await axios.post(`${RAG_SERVER_URL}/chat`, {
      message,
      language: language.toLowerCase(),
    });

    const { response } = ragRes.data as { response: string };

    res.status(200).json({
      response,
      conversation_id: `rag-${Date.now()}`,
    });
  } catch (error) {
    console.error('RAG Server Error:', error);
    res.status(500).json({
      error: 'Failed to get response from AI',
    });
  }
};
