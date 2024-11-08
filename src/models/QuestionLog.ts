import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../config/sequelize";
import { FAQ } from "./FAQ";

export type TQuestionLog = {
  id: number;
  faqId: number | null;
  userQuestion: string;
  feedbackScore: number | null;
  feedback: string | null;
  createdAt: Date;
};

export class QuestionLog extends Model<TQuestionLog> implements TQuestionLog {
  public id!: number;
  public faqId!: number | null;
  public userQuestion!: string;
  public feedbackScore!: number | null;
  public feedback!: string | null;
  public createdAt!: Date;

  static associate() {
    QuestionLog.belongsTo(FAQ, {
      foreignKey: "faqId",
      as: "faq",
      onDelete: "SET NULL",
    });
  }
}

QuestionLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    faqId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    userQuestion: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    feedbackScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    feedback: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "QuestionLog",
    tableName: "question_logs",
    timestamps: true,
    underscored: true,
  },
);

export default QuestionLog;
