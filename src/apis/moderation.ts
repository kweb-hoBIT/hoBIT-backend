import {Request, Response, NextFunction } from 'express';
import OpenAI from 'openai';
import { envs } from '../envs';

const openai = new OpenAI({
    apiKey: envs.OPENAI_KEY,
});

export const moderateContent = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try{
        const {content} = req.body;
        if (!content) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        const moderation = await openai.moderations.create({
            model: 'omni-moderation-latest',
            input: content,
        });

        // console.log(moderation);

        const result = moderation.results[0] || {flagged: false, categories: {}};

        res.status(200).json({
            allowed: !result.flagged,
            categories: result.categories,
        });
    } catch (error: any) {
        // Rate limit 에러 시 기본 허용
        if (error?.status === 429) {
            console.warn('OpenAI rate limit exceeded, allowing content by default');
            res.status(200).json({
                allowed: true,
                categories: {},
                warning: 'Moderation temporarily unavailable'
            });
            return;
        }
        next(error);
    }
};