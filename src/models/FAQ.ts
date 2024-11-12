import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../config/sequelize";
import { User } from "./User";

export type TFAQ = {
  id: number;
  maincategory_ko: string;
  maincategory_en: string;
  subcategory_ko: string;
  subcategory_en: string;
  question_ko: string;
  question_en: string;
  answer_ko: string;
  answer_en: string;
  manager: string;
  created_by: number | null;
  updated_by: number | null;
};

export class FAQ extends Model<TFAQ> implements TFAQ {
  public id!: number;
  public maincategory_ko!: string;
  public maincategory_en!: string;
  public subcategory_ko!: string;
  public subcategory_en!: string;
  public question_ko!: string;
  public question_en!: string;
  public answer_ko!: string;
  public answer_en!: string;
  public manager!: string;
  public created_by!: number | null;
  public updated_by!: number | null;

  static associate() {
    FAQ.belongsTo(User, {
      foreignKey: "created_by",
      as: "creator",
      onDelete: "SET NULL",
    });
    FAQ.belongsTo(User, {
      foreignKey: "updated_by",
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
    maincategory_ko: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    maincategory_en: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    subcategory_ko: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    subcategory_en: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    question_ko: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    question_en: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    answer_ko: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    answer_en: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    manager: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "FAQ",
    tableName: "faqs",
    timestamps: true,
    underscored: true,
  },
);

export default FAQ;
