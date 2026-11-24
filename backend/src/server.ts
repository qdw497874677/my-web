import { buildApp } from './app.js'
import { initializeOwner, openDatabase, seedContent } from './database.js'

if(process.env.NODE_ENV==='test'&&process.env.SEED_ON_START==='true'){
  const db=openDatabase(process.env.DATABASE_PATH??'./data/linjian.sqlite')
  try{
    if(process.env.OWNER_EMAIL&&process.env.OWNER_PASSWORD){
      const count=Number((db.prepare('SELECT COUNT(*) count FROM owners').get() as{count:number}).count)
      if(!count)await initializeOwner(db,process.env.OWNER_EMAIL,process.env.OWNER_PASSWORD)
    }
    seedContent(db)
  }finally{db.close()}
}

const app = await buildApp()
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3001) })
