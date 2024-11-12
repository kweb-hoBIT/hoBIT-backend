import mysql from "mysql2/promise";
import config from "config";

const dbHost = config.get<string>("dbHost");
const dbUser = config.get<string>("dbUser");
const dbPassword = config.get<string>("dbPassword");
const dbName = config.get<string>("dbName");

// MySQL connection pool
const Pool = mysql.createPool({
	host: dbHost,
	user: dbUser,
	password: dbPassword,
	database: dbName,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

export { Pool };
