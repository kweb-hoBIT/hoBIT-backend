import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../config/sequelize";
import { FAQ } from "./FAQ";
import { User } from "./User";

export type TFaqLog = {
  id: number;
  user_id: number | null;
  faq_id: number | null;
  prev_faq: string;
  new_faq: string;
  action_type: string;
  created_at?: Date;
};

export class FaqLog extends Model<TFaqLog> implements TFaqLog {
  public id!: number;
  public user_id!: number | null;
  public faq_id!: number | null;
  public prev_faq!: string;
  public new_faq!: string;
  public action_type!: string;
  public created_at!: Date;

  static associate() {
    FaqLog.belongsTo(FAQ, {
      foreignKey: "faq_id",
      as: "faq",
      onDelete: "SET NULL",
    });
    FaqLog.belongsTo(User, {
      foreignKey: "user_id",
      as: "user",
      onDelete: "SET NULL",
    });
  }
}

FaqLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    faq_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    prev_faq: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    new_faq: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    action_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "FaqLog",
    tableName: "faq_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    underscored: true,
  },
);

export default FaqLog;
