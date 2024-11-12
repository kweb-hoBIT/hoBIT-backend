import express from "express";

import { router } from "../router/index";
import { get_all_faqs, get_answer } from "../apis/question";

const PORT = 4000;
const API_V0 = "api/v0";

export async function runServer() {
  const app = express();

  app.get("/", (_req, res) => {
    res.send({ status: "State" });
  });

  app.get("/api/v0/all_faqs", get_all_faqs);
  app.get("/api/v0/question", get_answer);

  app.use(API_V0, router);

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
