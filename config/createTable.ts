import { createDB } from "./createDB";
import { sequelize } from "./sequelize";
import { User } from "../src/models/User";
import { FAQ } from "../src/models/FAQ";
import { QuestionLog } from "../src/models/QuestionLog";
import { FaqLog } from "../src/models/FAQLog";

export const createTable = async () => {
  try {
    await createDB();
    sequelize
      .authenticate()
      .then(() => {
        console.log("Connection has been established successfully.");
      })
      .catch((error) => {
        console.error("Unable to connect to the database:", error);
      });
    console.log("MySQL connected!");
    User.associate();
    FAQ.associate();
    QuestionLog.associate();
    FaqLog.associate();

    // 테이블 동기화(table 추가)
    await sequelize.sync({ force: false });
    console.log("Tables synchronized successfully.");
  } catch (err: any) {
    console.error("Error connecting to the database:", err.message);
    process.exit(1);
  }
};
