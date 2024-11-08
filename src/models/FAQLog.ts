import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../config/sequelize";
import { FAQ } from "./FAQ";
import { User } from "./User";

export type TFaqLog = {
  id: number;
  user_id: number | null;
  faq_id: number | null;
  prev_faq: any;
  new_faq: any;
  action_type: string;
  createdAt: Date;
};

export class FaqLog extends Model<TFaqLog> implements TFaqLog {
  public id!: number;
  public user_id!: number | null;
  public faq_id!: number | null;
  public prev_faq!: any;
  public new_faq!: any;
  public action_type!: string;
  public createdAt!: Date;

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
      type: DataTypes.JSON,
      allowNull: true,
    },
    new_faq: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    action_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "FaqLog",
    tableName: "faq_logs",
    timestamps: false,
    underscored: true,
  },
);

export default FaqLog;
