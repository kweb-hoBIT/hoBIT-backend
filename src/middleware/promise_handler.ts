import { NextFunction, Request, Response } from 'express';

type Fn<Req = Request, Res = Response> = (
  req: Req,
  res: Res,
  next: NextFunction
) => Promise<void>;

export const promiseHandler =
  <Req = Request, Res = Response>(fn: Fn<Req, Res>) =>
  (req: Req, res: Res, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      next(error);
    });
  };
