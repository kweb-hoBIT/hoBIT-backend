import { NextFunction, Request, Response } from 'express';
import { CustomError } from '../types';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) return next(err);
  console.error(err);

  if (err instanceof CustomError) {
    console.error(err.statusCode);
    res.status(err.statusCode).send(err.externalErrorMessage);
  } else {
    res.status(500).send(err.message);
  }
};
