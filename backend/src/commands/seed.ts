import { openDatabase, seedContent } from "../database.js";
const db = openDatabase(process.env.DATABASE_PATH ?? "./data/linjian.sqlite");
seedContent(db);
db.close();
console.log("演示内容导入完成");
