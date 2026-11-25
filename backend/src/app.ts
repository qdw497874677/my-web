import Fastify,{type FastifyInstance,type FastifyReply,type FastifyRequest}from'fastify'
import cookie from'@fastify/cookie'
import cors from'@fastify/cors'
import multipart from'@fastify/multipart'
import rateLimit from'@fastify/rate-limit'
import {openDatabase,initializeOwner,seedContent,hasOwner}from'./database.js'
import {Repository}from'./repository.js'
import {hashPassword,verifyPassword}from'./security.js'
import {LocalStorage,MemoryStorage,type StorageAdapter}from'./storage.js'
import {DomainError,type AlbumInput,type ArticleInput,type CollectionInput,type CollectionPresentationInput}from'./types.js'
import { aiImagesPlugin, type AiImagesOptions } from './plugins/ai-images/index.js'
import { ImageConfigurationError, loadImageModels } from './plugins/ai-images/providers.js'
import type { ImageModel } from './plugins/ai-images/contracts.js'
import { rasterType, readBounded } from './publication/raster.js'

export type App=FastifyInstance
export interface AppOptions{databasePath?:string;uploadDir?:string;storage?:StorageAdapter;frontendOrigin?:string;cookieSecure?:boolean;sessionTtlDays?:number;nodeEnv?:string;nowProvider?:()=>Date;seed?:boolean;initializeOwner?:{email:string;password:string};rateLimit?:{loginMax?:number;subscriptionMax?:number;timeWindow?:number}|false;aiImageModels?:readonly ImageModel[]}
type Json=Record<string,unknown>
const params=(request:FastifyRequest)=>request.params as Record<string,string>
const objectBody=(request:FastifyRequest):Json=>{if(!request.body||typeof request.body!=='object'||Array.isArray(request.body))throw new DomainError(400,'请求体必须是 JSON 对象');return request.body as Json}
const stringField=(value:unknown,name:string,required=true)=>{if(value===undefined&&!required)return undefined;if(typeof value!=='string'||(required&&!value.trim()))throw new DomainError(400,`${name} 必须是非空字符串`);return value}
const booleanField=(value:unknown,name:string)=>{if(value===undefined)return undefined;if(typeof value!=='boolean')throw new DomainError(400,`${name} 必须是布尔值`);return value}
const numberField=(value:unknown,name:string,{integer=false,min=0}:{integer?:boolean;min?:number}={})=>{if(value===undefined)return undefined;if(typeof value!=='number'||!Number.isFinite(value)||(integer&&!Number.isInteger(value))||value<min)throw new DomainError(400,`${name} 必须是有效数字`);return value}
const stringArray=(value:unknown,name:string)=>{if(!Array.isArray(value)||value.some(item=>typeof item!=='string'))throw new DomainError(400,`${name} 必须是字符串数组`);return value as string[]}
const enumField=<T extends string>(value:unknown,name:string,values:readonly T[])=>{if(value===undefined)return undefined;if(typeof value!=='string'||!values.includes(value as T))throw new DomainError(400,`${name} 枚举值无效`);return value as T}
const articleInput=(request:FastifyRequest,partial=false):Partial<ArticleInput>=>{const value=objectBody(request);return{...(value.title!==undefined||!partial?{title:stringField(value.title,'title')!}:{}),...(value.categoryId!==undefined||!partial?{categoryId:stringField(value.categoryId,'categoryId')!}:{}),...(value.slug!==undefined?{slug:stringField(value.slug,'slug')}:{}),...(value.excerpt!==undefined?{excerpt:stringField(value.excerpt,'excerpt',false)}:{}),...(value.date!==undefined?{date:stringField(value.date,'date')}:{}),...(value.readingMinutes!==undefined?{readingMinutes:numberField(value.readingMinutes,'readingMinutes',{integer:true})}:{}),...(value.image!==undefined?{image:stringField(value.image,'image')}:{}),...(value.imageAssetId!==undefined?{imageAssetId:stringField(value.imageAssetId,'imageAssetId')}:{}),...(value.alt!==undefined?{alt:stringField(value.alt,'alt',false)}:{}),...(value.body!==undefined?{body:stringField(value.body,'body',false)}:{}),...(value.status!==undefined?{status:enumField(value.status,'status',['draft','published','scheduled'] as const)}:{}),...(value.scheduledAt!==undefined?{scheduledAt:value.scheduledAt===null?null:stringField(value.scheduledAt,'scheduledAt')}:{}),...(value.pinned!==undefined?{pinned:booleanField(value.pinned,'pinned')}: {})} as Partial<ArticleInput>}
const albumInput=(request:FastifyRequest,partial=false):Partial<AlbumInput>=>{const value=objectBody(request);return{...(value.title!==undefined||!partial?{title:stringField(value.title,'title')!}:{}),...(value.categoryId!==undefined||!partial?{categoryId:stringField(value.categoryId,'categoryId')!}:{}),...(value.description!==undefined?{description:stringField(value.description,'description',false)}:{}),...(value.location!==undefined?{location:stringField(value.location,'location')}:{}),...(value.date!==undefined?{date:stringField(value.date,'date')}:{}),...(value.coverPhotoId!==undefined?{coverPhotoId:value.coverPhotoId===null?null:stringField(value.coverPhotoId,'coverPhotoId')}:{}),...(value.isPrivate!==undefined?{isPrivate:booleanField(value.isPrivate,'isPrivate')}: {})} as Partial<AlbumInput>}
const collectionInput=(request:FastifyRequest)=>{const body=objectBody(request),raw=body.items;if(!Array.isArray(raw))throw new DomainError(400,'items 必须是数组');const items=raw.map((entry,index)=>{if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new DomainError(400,`items[${index}] 必须是对象`);const value=entry as Json,type=enumField(value.type,'type',['article','album','photo'] as const)!;return{...(value.id!==undefined?{id:stringField(value.id,'id')}:{}),type,...(value.articleId!==undefined?{articleId:stringField(value.articleId,'articleId')}:{}),...(value.albumId!==undefined?{albumId:stringField(value.albumId,'albumId')}:{}),...(value.photoId!==undefined?{photoId:stringField(value.photoId,'photoId')}:{}),...(value.note!==undefined?{note:stringField(value.note,'note',false)}:{}),...(value.visible!==undefined?{visible:booleanField(value.visible,'visible')}: {})} as CollectionInput});if(!body.presentation||typeof body.presentation!=='object'||Array.isArray(body.presentation))throw new DomainError(400,'presentation 必须是对象');const value=body.presentation as Json,defaultTheme=enumField(value.defaultTheme,'defaultTheme',['stamp','editorial','holographic','cinema','boarding'] as const),enabledThemes=stringArray(value.enabledThemes,'enabledThemes');if(!defaultTheme)throw new DomainError(400,'defaultTheme 必填');if(!enabledThemes.length||new Set(enabledThemes).size!==enabledThemes.length||enabledThemes.some(theme=>theme!=='stamp'&&theme!=='editorial'&&theme!=='holographic'&&theme!=='cinema'&&theme!=='boarding')||!enabledThemes.includes(defaultTheme))throw new DomainError(400,'收藏展示主题配置无效');return{items,presentation:{defaultTheme,enabledThemes} as CollectionPresentationInput}}

function configureAiImages(models: AppOptions['aiImageModels']): Omit<AiImagesOptions, 'trustedOrigin'> {
  try {
    return { models: models ?? loadImageModels() }
  } catch (error) {
    if (!(error instanceof ImageConfigurationError)) throw error
    return { models: [], issue: 'invalid_configuration' }
  }
}

export async function buildApp(options:AppOptions={}):Promise<App>{
  const nodeEnv=options.nodeEnv??process.env.NODE_ENV??'development'
  const frontendOrigin = options.frontendOrigin ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
  const aiImages = configureAiImages(options.aiImageModels)
  if (aiImages.models.length) {
    const origin = URL.parse(frontendOrigin)
    if (!origin || !['http:', 'https:'].includes(origin.protocol) || origin.origin !== frontendOrigin) {
      throw new Error('AI 生图要求 FRONTEND_ORIGIN 是完整的 HTTP(S) 源，不带末尾斜杠')
    }
  }
  const clock=options.nowProvider??(()=>new Date())
  const db=openDatabase(options.databasePath??process.env.DATABASE_PATH??'./data/linjian.sqlite')
  try{
    if(options.initializeOwner)await initializeOwner(db,options.initializeOwner.email,options.initializeOwner.password,clock())
    if(options.seed)seedContent(db,clock())
  }catch(error){
    db.close()
    throw error
  }
  if(nodeEnv!=='test'&&!hasOwner(db)){
    db.close()
    throw new Error('数据库尚未初始化所有者，请先运行 owner:init')
  }
  const repository=new Repository(db,clock)
  const storage=options.storage??(options.uploadDir==='memory'?new MemoryStorage():new LocalStorage(options.uploadDir??process.env.UPLOAD_DIR??'./uploads'))
  const dummyPasswordHash=await hashPassword('linjian-invalid-login-password')
  const app=Fastify({logger:false})
  const limitOptions=options.rateLimit===false?null:{
    loginMax:options.rateLimit?.loginMax??6,
    subscriptionMax:options.rateLimit?.subscriptionMax??10,
    timeWindow:options.rateLimit?.timeWindow??15*60*1000
  }
  await app.register(cookie)
  await app.register(cors,{origin:frontendOrigin,credentials:true})
  await app.register(multipart,{limits:{fileSize:10*1024*1024,files:1}})
  if(limitOptions)await app.register(rateLimit,{global:false,max:limitOptions.loginMax,timeWindow:limitOptions.timeWindow,cache:5000})
  app.addHook('onClose',async()=>repository.close())
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof DomainError)return reply.code(error.statusCode).send({error:error.message})
    if((error as{validation?:unknown}).validation)return reply.code(400).send({error:'请求格式无效'})
    if((error as{code?:string}).code?.startsWith('SQLITE_CONSTRAINT'))return reply.code(409).send({error:'数据约束冲突'})
    const httpError=error as{statusCode?:number;message?:string}
    const statusCode=httpError.statusCode
    if(statusCode&&statusCode>=400&&statusCode<500)return reply.code(statusCode).send({error:httpError.message??'请求失败'})
    app.log.error(error)
    return reply.code(500).send({error:'服务器内部错误'})
  })
  const requireOwner=async(request:FastifyRequest,reply:FastifyReply)=>{const id=request.cookies.linjian_session;if(!id||!repository.ownerBySession(id))return reply.code(401).send({error:'需要刊物所有者会话'})}
  const mediaHeaders=async(_request:FastifyRequest,reply:FastifyReply)=>{reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff')}
  const serveImage=async(asset:Record<string,unknown>,reply:FastifyReply)=>{if(asset.kind==='external')return reply.redirect(String(asset.url),302);let data:Buffer;try{data=await readBounded(storage.read(String(asset.path)))}catch{throw new DomainError(404,'图片资产不存在')}const type=rasterType(data);if(!type||type!==asset.media_type)throw new DomainError(404,'图片资产不存在');return reply.type(type).send(data)}
  app.get('/api/health',async()=>({status:'ok',service:'linjian-backend'}))
  app.post('/api/auth/login',{
    config:{rateLimit:limitOptions?{max:limitOptions.loginMax,timeWindow:limitOptions.timeWindow,keyGenerator:(request:FastifyRequest)=>request.ip}:false}
  },async(request,reply)=>{
    const value=objectBody(request)
    const email=stringField(value.email,'email')!.trim().toLowerCase()
    const password=stringField(value.password,'password')!
    const timestamp=clock().getTime()
    const owner=repository.ownerByEmail(email)
    const passwordMatches=await verifyPassword(password,owner?String(owner.password_hash):dummyPasswordHash)
    if(!owner||!passwordMatches)throw new DomainError(401,'邮箱或密码不正确')

    const expires=new Date(timestamp+(options.sessionTtlDays??Number(process.env.SESSION_TTL_DAYS??30))*86400000)
    const id=repository.createSession(String(owner.id),expires.toISOString())
    const secure=options.cookieSecure??(process.env.COOKIE_SECURE?process.env.COOKIE_SECURE==='true':nodeEnv==='production')
    reply.setCookie('linjian_session',id,{httpOnly:true,sameSite:'lax',secure,path:'/',expires})
    return{authenticated:true,owner:{id:owner.id,email:owner.email}}
  })
  app.post('/api/auth/logout',async(request,reply)=>{if(request.cookies.linjian_session)repository.deleteSession(request.cookies.linjian_session);reply.clearCookie('linjian_session',{path:'/'}).code(204).send()});app.get('/api/auth/session',async request=>{const owner=request.cookies.linjian_session?repository.ownerBySession(request.cookies.linjian_session):undefined;return owner?{authenticated:true,owner}:{authenticated:false}})
  app.register(async admin=>{admin.addHook('preHandler',requireOwner)
    await admin.register(aiImagesPlugin, { prefix: '/ai-images', ...aiImages, trustedOrigin: frontendOrigin })
    admin.get('/categories',async()=>({items:repository.categories()}));admin.post('/categories',async(request,reply)=>reply.code(201).send(repository.createCategory(stringField(objectBody(request).name,'name')!)));admin.patch('/categories/:id',async request=>repository.updateCategory(params(request).id!,stringField(objectBody(request).name,'name')!));admin.put('/categories/order',async request=>({items:repository.orderCategories(stringArray(objectBody(request).ids,'ids'))}));admin.delete('/categories/:id',async(request,reply)=>{repository.deleteCategory(params(request).id!);reply.code(204).send()})
    admin.get('/articles',async()=>({items:repository.articles()}));admin.post('/articles',async(request,reply)=>reply.code(201).send(repository.createArticle(articleInput(request) as ArticleInput)));admin.get('/articles/:id',async request=>repository.getArticle(params(request).id!));admin.patch('/articles/:id',async request=>repository.updateArticle(params(request).id!,articleInput(request,true)));admin.post('/articles/:id/archive',async request=>repository.archiveArticle(params(request).id!,true));admin.post('/articles/:id/restore',async request=>repository.archiveArticle(params(request).id!,false))
    admin.get('/albums',async()=>({items:repository.albums()}));admin.post('/albums',async(request,reply)=>reply.code(201).send(repository.createAlbum(albumInput(request) as AlbumInput)));admin.get('/albums/:id',async request=>repository.getAlbum(params(request).id!));admin.patch('/albums/:id',async request=>repository.updateAlbum(params(request).id!,albumInput(request,true)));admin.post('/albums/:id/archive',async request=>repository.archiveAlbum(params(request).id!,true));admin.post('/albums/:id/restore',async request=>repository.archiveAlbum(params(request).id!,false))
    admin.post('/albums/:id/photos',async(request,reply)=>{const value=objectBody(request),input:{title:string;caption?:string;image?:string;imageAssetId?:string;alt?:string}={title:stringField(value.title,'title')!};if(value.caption!==undefined)input.caption=stringField(value.caption,'caption',false)!;if(value.image!==undefined)input.image=stringField(value.image,'image')!;if(value.imageAssetId!==undefined)input.imageAssetId=stringField(value.imageAssetId,'imageAssetId')!;if(value.alt!==undefined)input.alt=stringField(value.alt,'alt',false)!;return reply.code(201).send(repository.createPhoto(params(request).id!,input))});admin.put('/albums/:id/photos/order',async request=>repository.orderPhotos(params(request).id!,stringArray(objectBody(request).ids,'ids')));admin.patch('/photos/:id',async request=>{const value=objectBody(request),input:{title?:string;caption?:string;image?:string;imageAssetId?:string;alt?:string}={};if(value.title!==undefined)input.title=stringField(value.title,'title')!;if(value.caption!==undefined)input.caption=stringField(value.caption,'caption',false)!;if(value.image!==undefined)input.image=stringField(value.image,'image')!;if(value.imageAssetId!==undefined)input.imageAssetId=stringField(value.imageAssetId,'imageAssetId')!;if(value.alt!==undefined)input.alt=stringField(value.alt,'alt',false)!;return repository.updatePhoto(params(request).id!,input)});admin.post('/photos/:id/move',async request=>{const value=objectBody(request);return repository.movePhoto(params(request).id!,stringField(value.albumId,'albumId')!,numberField(value.position,'position',{integer:true}))});admin.delete('/photos/:id',async(request,reply)=>{repository.deletePhoto(params(request).id!);reply.code(204).send()})
    admin.get('/collections',async()=>repository.collectionCatalog());admin.put('/collections',async request=>{const value=collectionInput(request);return repository.saveCollection(value.items,value.presentation)})
    admin.get('/images',async()=>({items:repository.assets()}));admin.get('/images/:id',{onRequest:mediaHeaders},async(request,reply)=>serveImage(repository.asset(params(request).id!),reply));admin.post('/images',async(request,reply)=>{const part=await request.file();if(!part)throw new DomainError(400,'需要上传图片');const data=await part.toBuffer(),type=rasterType(data);if(!type||type!==part.mimetype)throw new DomainError(415,'只允许内容与类型匹配的 PNG、JPEG、GIF 或 WebP 图片');const path=storage.put(part.filename,data);try{const asset=repository.createAsset(part.filename,type,data.length,path);return reply.code(201).send(asset)}catch(error){storage.remove(path);throw error}});admin.delete('/images/:id',async(request,reply)=>{const asset=repository.asset(params(request).id!);if(asset.kind!=='local')throw new DomainError(409,'预置外部资产不可删除');const quarantined=storage.quarantine(String(asset.path));try{repository.deleteAsset(String(asset.id))}catch(error){storage.restore(quarantined,String(asset.path));throw error}try{storage.remove(quarantined)}catch{app.log.warn({assetId:asset.id,quarantined},'图片隔离文件清理失败')}reply.code(204).send()})
  },{prefix:'/api/admin'})
  app.get('/api/images/:id',{onRequest:mediaHeaders},async(request,reply)=>serveImage(repository.publicAsset(params(request).id!),reply))
  app.get('/api/public/articles',async()=>({items:repository.publicArticles()}));app.get('/api/public/articles/:slug',async(request,reply)=>{const result=repository.publicArticle(params(request).slug!);if(result.redirect)return reply.redirect(`/api/public/articles/${result.article.slug}`,308);return result.article});app.get('/api/public/albums',async()=>({items:repository.publicAlbums()}));app.get('/api/public/albums/:id',async request=>repository.publicAlbum(params(request).id!));app.get('/api/public/collections',async()=>({items:repository.collectionItems(true),presentation:repository.collectionPresentation()}));app.post('/api/public/subscriptions',{config:{rateLimit:limitOptions?{max:limitOptions.subscriptionMax,timeWindow:limitOptions.timeWindow,keyGenerator:(request:FastifyRequest)=>request.ip}:false}},async(request,reply)=>{const email=stringField(objectBody(request).email,'email')!;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))throw new DomainError(400,'邮箱格式不正确');repository.subscribe(email);return reply.code(204).send()})
  await app.ready();return app
}
