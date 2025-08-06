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
    } catch (error) {
        next(error);
    }
};