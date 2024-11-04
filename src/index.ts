import express, { Request, Response } from "express";

const app = express();
const port = process.env.PORT || 4000;

app.get("/", (req: Request, res: Response) => {
  res.send("HoBIT");
});

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
