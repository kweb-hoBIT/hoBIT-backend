import { Request, Response } from "express";

export async function get_answer(_req: Request, res: Response) {
  res.send("answer");
}
