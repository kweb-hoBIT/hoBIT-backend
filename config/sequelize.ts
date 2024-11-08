// sequelize 함수 설정

import { Sequelize } from "sequelize";
import config from "config";

// Database settings
const dbHost = config.get<string>("dbHost");
const dbUser = config.get<string>("dbUser");
const dbPassword = config.get<string>("dbPassword");
const dbName = config.get<string>("dbName");

// Sequelize instance
const sequelize = new Sequelize({
  host: dbHost,
  username: dbUser,
  password: dbPassword,
  database: dbName,
  dialect: "mysql",
  logging: false,
});

export { sequelize };
