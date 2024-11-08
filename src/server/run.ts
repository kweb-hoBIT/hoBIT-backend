import express from "express";

import { router } from "@/router";

const PORT = 4000;
const API_V0 = "api/v0";

export async function runServer() {
  const app = express();

  app.get("/", (_req, res) => {
    res.send({ status: "State" });
  });

  app.use(API_V0, router);

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
