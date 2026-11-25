import { openDatabase } from "../database.js";
const db = openDatabase(process.env.DATABASE_PATH ?? "./data/linjian.sqlite");
db.close();
console.log("数据库迁移完成");
