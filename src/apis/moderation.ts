import {Request, Response } from 'express';
import OpenAI from 'openai';
import { envs } from '../envs';

const openai = new OpenAI({
    apiKey: envs.OPENAI_KEY,
});

export const moderateContent = async (
    req: Request,
    res: Response
): Promise<void> => {
    try{
        const {content} = req.body;
        
        if (!content) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a content moderation system. Analyze the given text for harmful content including:
                                - Hate speech, discrimination, harassment
                                - Sexual content, explicit material
                                - Violence, self-harm
                                - Illegal activities, scams
                                - Spam, malicious intent
                                - Offensive or profane language
                                - Disrespectful, mocking, or sarcastic tone towards staff/administrators
                                - Rude complaints or hostile attitude
                                - Questioning competence or insulting service quality in an aggressive manner

                                Respond ONLY with a JSON object in this format:
                                {
                                "allowed": true/false,
                                "flagged": true/false,
                                "categories": {
                                    "hate": true/false,
                                    "sexual": true/false,
                                    "violence": true/false,
                                    "self_harm": true/false,
                                    "harassment": true/false,
                                    "illegal": true/false,
                                    "spam": true/false,
                                    "disrespectful": true/false
                                },
                                "reason": "brief explanation if flagged"
                                }`
                },
                {
                    role: 'user',
                    content: content
                }
            ],
            temperature: 0,
            max_tokens: 300,
            response_format: { type: "json_object" }
        });

        const responseText = completion.choices[0]?.message?.content || '{}';
        const result = JSON.parse(responseText);
        
        // 유해 콘텐츠 감지 시 로깅
        if (result.flagged) {
            console.warn('[Moderation] Flagged content detected:', {
                categories: result.categories,
                reason: result.reason
            });
        }
        
        res.status(200).json({
            allowed: result.allowed !== false,
            categories: result.categories || {},
            reason: result.reason
        });
    } catch (error: any) {
        console.error('[Moderation] Error:', {
            message: error?.message,
            status: error?.status,
            code: error?.code
        });
        
        // 에러 발생 시 기본 허용 (서비스 중단 방지)
        res.status(200).json({
            allowed: true,
            categories: {},
            warning: 'Moderation temporarily unavailable'
        });
        return;
    }
};