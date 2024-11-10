import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../config/sequelize";
import { FAQ } from "./FAQ";

export type TUser = {
  id: number;
  email: string;
  password: string;
  username: string;
  phone_num: string;
  created_at?: Date;
  updated_at?: Date;
};

export class User extends Model<TUser> implements TUser {
  public id!: number;
  public email!: string;
  public password!: string;
  public username!: string;
  public phone_num!: string;
  public created_at!: Date;
  public updated_at!: Date;

  static associate() {
    User.hasMany(FAQ, { foreignKey: "createdBy", as: "faqsCreated" });
    User.hasMany(FAQ, { foreignKey: "updatedBy", as: "faqsUpdated" });
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
      type: DataTypes.STRING(100),
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
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: true,
    underscored: true,
  },
);

export default User;
