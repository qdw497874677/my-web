import { initializeOwner, openDatabase } from "../database.js";

const email = process.env.OWNER_EMAIL,
  password = process.env.OWNER_PASSWORD;
if (!email || !password) throw new Error("owner:init 需要 OWNER_EMAIL 和 OWNER_PASSWORD");
const db = openDatabase(process.env.DATABASE_PATH ?? "./data/linjian.sqlite");
try {
  await initializeOwner(db, email, password);
} finally {
  db.close();
}
console.log("所有者账户初始化完成");
