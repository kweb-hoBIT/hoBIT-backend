import { NextFunction, Request, Response } from 'express';
import { CustomError } from '../types';

type Fn<Req = Request, Res = Response> = (
  req: Req,
  res: Res,
  next: NextFunction
) => Promise<void>;

export const promiseHandler =
  <Req = Request, Res = Response>(fn: Fn<Req, Res>) =>
  (req: Req, res: Res, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  //console.error(err.stack);
  if (err instanceof CustomError) {
    console.error(err.statusCode);
    res.status(err.statusCode).send(err.message);
  }
  res.status(400).send(err.message);
};
