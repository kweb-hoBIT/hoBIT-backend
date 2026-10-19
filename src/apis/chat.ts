import { Request, Response } from 'express';
import axios from 'axios';
import { envs } from '../envs';
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
