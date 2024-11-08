import mysql from "mysql2/promise";
import config from "config";

const dbHost = config.get<string>("dbHost");
const dbUser = config.get<string>("dbUser");
const dbPassword = config.get<string>("dbPassword");
const dbName = config.get<string>("dbName");

export const createConnection = async () => {
  return await mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
  });
};

export const createDB = async () => {
  const connection = await createConnection();
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  console.log(`Database ${dbName} created or already exists.`);
  await connection.end();
};
