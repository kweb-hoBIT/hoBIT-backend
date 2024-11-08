import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../config/sequelize";
import { FAQ } from "./FAQ";

export type TUser = {
  id: number;
  email: string;
  password: string;
  username: string;
  phone_num: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class User extends Model<TUser> implements TUser {
  public id!: number;
  public email!: string;
  public password!: string;
  public username!: string;
  public phone_num!: string;
  public createdAt!: Date;
  public updatedAt!: Date;

  static associate() {
    User.hasMany(FAQ, { foreignKey: "createdBy", as: "faqsCreated" });
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(45),
      allowNull: false,
    },
    phone_num: {
      type: DataTypes.STRING(45),
      allowNull: false,
      unique: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: false,
    underscored: true,
  },
);

export default User;
