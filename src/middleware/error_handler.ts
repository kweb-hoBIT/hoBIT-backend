import { NextFunction, Request, Response } from 'express';
import { CustomError } from '../types';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (res.headersSent) return;

  console.error(err.message);
  if (err instanceof CustomError) {
    console.error(err.statusCode);
    res.status(err.statusCode).send(err.message);
  } else {
    res.status(400).send(err.message);
  }
};
