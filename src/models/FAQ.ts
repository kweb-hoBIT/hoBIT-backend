import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../config/sequelize";
import { User } from "./User";

export type TFAQ = {
  id: number;
  maincategoryKo: string;
  maincategoryEn: string;
  subcategoryKo: string;
  subcategoryEn: string;
  questionKo: string;
  questionEn: string;
  answerKo: object;
  answerEn: object;
  createdAt: Date;
  createdBy: number | null;
  updatedAt: Date;
  updatedBy: number | null;
};

export class FAQ extends Model<TFAQ> implements TFAQ {
  public id!: number;
  public maincategoryKo!: string;
  public maincategoryEn!: string;
  public subcategoryKo!: string;
  public subcategoryEn!: string;
  public questionKo!: string;
  public questionEn!: string;
  public answerKo!: object;
  public answerEn!: object;
  public createdAt!: Date;
  public createdBy!: number | null;
  public updatedAt!: Date;
  public updatedBy!: number | null;

  static associate() {
    FAQ.belongsTo(User, {
      foreignKey: "createdBy",
      as: "creator",
      onDelete: "SET NULL",
    });
    FAQ.belongsTo(User, {
      foreignKey: "updatedBy",
      as: "updater",
      onDelete: "SET NULL",
    });
  }
}

FAQ.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    maincategoryKo: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    maincategoryEn: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    subcategoryKo: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    subcategoryEn: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    questionKo: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    questionEn: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    answerKo: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    answerEn: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "FAQ",
    tableName: "faqs",
    timestamps: false,
    underscored: true,
  },
);

export default FAQ;
