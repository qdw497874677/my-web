import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { DomainError, type AlbumInput, type ArticleInput, type CollectionInput, type CollectionPresentationInput } from './types.js'

type Row = Record<string, unknown>
type Clock = () => Date
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,'-').replace(/^-|-$/g,'') || `article-${randomUUID()}`
const zonedIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

export class Repository {
  constructor(private db: DatabaseSync, private clock: Clock = () => new Date()) {}
  close() { this.db.close() }
  private now() { return this.clock().toISOString() }
  private get(sql: string,...params:(string|number|null)[]) { return this.db.prepare(sql).get(...params) as Row|undefined }
  private all(sql: string,...params:(string|number|null)[]) { return this.db.prepare(sql).all(...params) as Row[] }
  private required(row:Row|undefined,label='内容') { if(!row) throw new DomainError(404,`${label}不存在`); return row }
  private transaction<T>(run:()=>T) { this.db.exec('BEGIN IMMEDIATE'); try { const result=run(); this.db.exec('COMMIT'); return result } catch(error){this.db.exec('ROLLBACK');throw error} }
  private assertCompleteOrder(ids:string[],current:string[]) { if(ids.length!==current.length || new Set(ids).size!==ids.length || ids.some(id=>!current.includes(id))) throw new DomainError(400,'排序必须是完整且无重复的排列') }
  private validateScheduled(status:string,scheduledAt:unknown) { if(status!=='scheduled') return null; if(typeof scheduledAt!=='string'||!zonedIso.test(scheduledAt)||Number.isNaN(Date.parse(scheduledAt))) throw new DomainError(400,'scheduledAt 必须是带时区的 ISO 时刻'); return new Date(scheduledAt).toISOString() }
  private isPublicArticle(row:Row) { return !row.archived_at && (row.status==='published' || (row.status==='scheduled' && typeof row.scheduled_at==='string' && Date.parse(row.scheduled_at)<=this.clock().getTime())) }
  private assetUrl(row:Row) { return row.asset_kind==='external' ? String(row.asset_url) : `/api/images/${String(row.image_asset_id)}` }

  ownerByEmail(email:string){return this.get('SELECT * FROM owners WHERE email=?',email.toLowerCase())}
  ownerBySession(id:string){return this.get('SELECT o.id,o.email FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.id=? AND s.expires_at>?',id,this.now())}
  createSession(ownerId:string,expiresAt:string){const id=randomUUID();this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(id,ownerId,expiresAt);return id}
  deleteSession(id:string){this.db.prepare('DELETE FROM sessions WHERE id=?').run(id)}

  categories(){return this.all('SELECT id,name,position FROM categories ORDER BY position')}
  createCategory(name:string){const id=`category-${randomUUID()}`,position=Number(this.get('SELECT COALESCE(MAX(position),-1)+1 value FROM categories')?.value??0);try{this.db.prepare('INSERT INTO categories VALUES (?,?,?)').run(id,name.trim(),position)}catch{throw new DomainError(409,'栏目名称已存在')}return this.get('SELECT * FROM categories WHERE id=?',id)}
  updateCategory(id:string,name:string){this.required(this.get('SELECT id FROM categories WHERE id=?',id),'栏目');try{this.db.prepare('UPDATE categories SET name=? WHERE id=?').run(name.trim(),id)}catch{throw new DomainError(409,'栏目名称已存在')}return this.get('SELECT * FROM categories WHERE id=?',id)}
  orderCategories(ids:string[]){const current=this.categories().map(row=>String(row.id));this.assertCompleteOrder(ids,current);return this.transaction(()=>{this.db.exec('UPDATE categories SET position=position+1000');ids.forEach((id,index)=>this.db.prepare('UPDATE categories SET position=? WHERE id=?').run(index,id));return this.categories()})}
  deleteCategory(id:string){const refs=Number(this.get('SELECT (SELECT COUNT(*) FROM articles WHERE category_id=?)+(SELECT COUNT(*) FROM albums WHERE category_id=?) AS count',id,id)?.count??0);if(refs)throw new DomainError(409,'栏目仍被内容引用');this.transaction(()=>{if(!this.db.prepare('DELETE FROM categories WHERE id=?').run(id).changes)throw new DomainError(404,'栏目不存在');const ids=this.categories().map(row=>String(row.id));this.db.exec('UPDATE categories SET position=position+1000');ids.forEach((categoryId,index)=>this.db.prepare('UPDATE categories SET position=? WHERE id=?').run(index,categoryId))})}

  private articleRows(where='',...params:(string|number|null)[]){return this.all(`SELECT a.*,c.name category,x.kind asset_kind,x.url asset_url FROM articles a JOIN categories c ON c.id=a.category_id JOIN assets x ON x.id=a.image_asset_id ${where}`,...params)}
  private article(row:Row){return{id:row.id,slug:row.slug,title:row.title,excerpt:row.excerpt,category:row.category,categoryId:row.category_id,date:row.date,readingMinutes:row.reading_minutes,image:this.assetUrl(row),imageAssetId:row.image_asset_id,alt:row.alt,body:row.body,status:row.status,...(row.scheduled_at?{scheduledAt:row.scheduled_at}:{}),pinned:Boolean(row.pinned),archived:Boolean(row.archived_at),createdAt:row.created_at,updatedAt:row.updated_at}}
  articles(){return this.articleRows('ORDER BY a.created_at DESC').map(row=>this.article(row))}
  getArticle(id:string){return this.article(this.required(this.articleRows('WHERE a.id=?',id)[0],'文章'))}
  private assetId(input:{imageAssetId?:string;image?:string},fallbackUrl='/assets/cta.png'){if(input.imageAssetId){this.required(this.get('SELECT id FROM assets WHERE id=?',input.imageAssetId),'图片资产');return input.imageAssetId}const url=input.image??fallbackUrl,localId=url.match(/^\/api\/images\/(asset-[a-z0-9-]+)$/)?.[1];if(localId){this.required(this.get('SELECT id FROM assets WHERE id=?',localId),'图片资产');return localId}const asset=this.get("SELECT id FROM assets WHERE kind='external' AND url=?",url);if(!asset)throw new DomainError(400,'image 必须引用已登记的图片资产');return String(asset.id)}
  private uniqueSlug(value:string,exceptId?:string){const slug=slugify(value),current=this.get('SELECT id FROM articles WHERE slug=?',slug),old=this.get('SELECT article_id FROM article_slugs WHERE slug=?',slug);if((current&&current.id!==exceptId)||(old&&old.article_id!==exceptId))throw new DomainError(409,'文章路径已存在');return slug}
  createArticle(input:ArticleInput){const status=input.status??'draft',scheduledAt=this.validateScheduled(status,input.scheduledAt),id=`article-${randomUUID()}`,timestamp=this.now(),slug=this.uniqueSlug(input.slug??input.title),assetId=this.assetId(input);this.db.prepare('INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)').run(id,slug,input.title.trim(),input.excerpt??'',input.categoryId,input.date??'未排期',input.readingMinutes??0,assetId,input.alt??input.title,input.body??'',status,scheduledAt,input.pinned?1:0,timestamp,timestamp);return this.getArticle(id)}
  updateArticle(id:string,input:Partial<ArticleInput>){const current=this.required(this.get('SELECT * FROM articles WHERE id=?',id),'文章');return this.transaction(()=>{let slug=String(current.slug);if(input.slug&&input.slug!==slug){const next=this.uniqueSlug(input.slug,id);this.db.prepare('INSERT OR IGNORE INTO article_slugs VALUES (?,?)').run(slug,id);slug=next}const status=input.status??String(current.status),scheduledSource=input.scheduledAt===undefined?current.scheduled_at:input.scheduledAt,scheduledAt=this.validateScheduled(status,scheduledSource),assetId=input.imageAssetId||input.image?this.assetId(input):String(current.image_asset_id);this.db.prepare('UPDATE articles SET slug=?,title=?,excerpt=?,category_id=?,date=?,reading_minutes=?,image_asset_id=?,alt=?,body=?,status=?,scheduled_at=?,pinned=?,updated_at=? WHERE id=?').run(slug,input.title??current.title as string,input.excerpt??current.excerpt as string,input.categoryId??current.category_id as string,input.date??current.date as string,input.readingMinutes??current.reading_minutes as number,assetId,input.alt??current.alt as string,input.body??current.body as string,status,scheduledAt,input.pinned===undefined?current.pinned as number:input.pinned?1:0,this.now(),id);return this.getArticle(id)})}
  archiveArticle(id:string,archived:boolean){this.required(this.get('SELECT id FROM articles WHERE id=?',id),'文章');this.db.prepare('UPDATE articles SET archived_at=?,updated_at=? WHERE id=?').run(archived?this.now():null,this.now(),id);return this.getArticle(id)}
  publicArticles(){return this.articleRows('ORDER BY a.pinned DESC,a.date DESC').filter(row=>this.isPublicArticle(row)).map(row=>this.article(row))}
  publicArticle(slug:string){const direct=this.articleRows('WHERE a.slug=?',slug)[0];if(direct&&this.isPublicArticle(direct))return{article:this.article(direct),redirect:false};const old=this.get('SELECT article_id FROM article_slugs WHERE slug=?',slug),target=old?this.articleRows('WHERE a.id=?',String(old.article_id))[0]:undefined;if(!target||!this.isPublicArticle(target))throw new DomainError(404,'文章不存在');return{article:this.article(target),redirect:true}}

  private photoRows(albumId:string){return this.all('SELECT p.*,x.kind asset_kind,x.url asset_url FROM photos p JOIN assets x ON x.id=p.image_asset_id WHERE p.album_id=? ORDER BY p.position',albumId)}
  private photo(row:Row){return{id:row.id,title:row.title,caption:row.caption,image:this.assetUrl(row),imageAssetId:row.image_asset_id,alt:row.alt,position:row.position}}
  private albumRows(where='',...params:(string|number|null)[]){return this.all(`SELECT a.*,c.name category FROM albums a JOIN categories c ON c.id=a.category_id ${where}`,...params)}
  private album(row:Row){return{id:row.id,title:row.title,description:row.description,category:row.category,categoryId:row.category_id,location:row.location,date:row.date,...(row.cover_photo_id?{coverPhotoId:row.cover_photo_id}:{}),isPrivate:Boolean(row.is_private),archived:Boolean(row.archived_at),photos:this.photoRows(String(row.id)).map(item=>this.photo(item)),createdAt:row.created_at,updatedAt:row.updated_at}}
  albums(){return this.albumRows('ORDER BY a.created_at DESC').map(row=>this.album(row))}
  getAlbum(id:string){return this.album(this.required(this.albumRows('WHERE a.id=?',id)[0],'相册'))}
  createAlbum(input:AlbumInput){if(input.isPrivate===false)throw new DomainError(409,'公开相册至少需要一张照片');if(input.coverPhotoId)throw new DomainError(400,'新相册不能指定尚不存在的封面');const id=`album-${randomUUID()}`,timestamp=this.now();this.db.prepare('INSERT INTO albums VALUES (?,?,?,?,?,?,NULL,1,NULL,?,?)').run(id,input.title.trim(),input.description??'',input.categoryId,input.location??'未填写',input.date??'未排期',timestamp,timestamp);return this.getAlbum(id)}
  updateAlbum(id:string,input:Partial<AlbumInput>){const current=this.required(this.get('SELECT * FROM albums WHERE id=?',id),'相册'),isPrivate=input.isPrivate===undefined?Boolean(current.is_private):input.isPrivate,count=this.photoRows(id).length;if(!current.archived_at&&!isPrivate&&!count)throw new DomainError(409,'公开相册至少需要一张照片');if(input.coverPhotoId&&!this.get('SELECT id FROM photos WHERE id=? AND album_id=?',input.coverPhotoId,id))throw new DomainError(400,'封面必须属于该相册');this.db.prepare('UPDATE albums SET title=?,description=?,category_id=?,location=?,date=?,cover_photo_id=?,is_private=?,updated_at=? WHERE id=?').run(input.title??current.title as string,input.description??current.description as string,input.categoryId??current.category_id as string,input.location??current.location as string,input.date??current.date as string,input.coverPhotoId===undefined?current.cover_photo_id as string|null:input.coverPhotoId,isPrivate?1:0,this.now(),id);return this.getAlbum(id)}
  archiveAlbum(id:string,archived:boolean){const album=this.required(this.get('SELECT is_private FROM albums WHERE id=?',id),'相册');if(!archived&&!album.is_private&&!this.photoRows(id).length)throw new DomainError(409,'公开相册至少需要一张照片');this.db.prepare('UPDATE albums SET archived_at=?,updated_at=? WHERE id=?').run(archived?this.now():null,this.now(),id);return this.getAlbum(id)}
  publicAlbums(){return this.albumRows('WHERE a.archived_at IS NULL AND a.is_private=0 ORDER BY a.date DESC').map(row=>this.album(row))}
  publicAlbum(id:string){return this.album(this.required(this.albumRows('WHERE a.id=? AND a.archived_at IS NULL AND a.is_private=0',id)[0],'相册'))}
  createPhoto(albumId:string,input:{title:string;caption?:string;image?:string;imageAssetId?:string;alt?:string}){this.required(this.get('SELECT id FROM albums WHERE id=?',albumId),'相册');const id=`photo-${randomUUID()}`,position=this.photoRows(albumId).length,assetId=this.assetId(input,'/assets/hero.png');this.db.prepare('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?)').run(id,albumId,input.title,input.caption??'',assetId,input.alt??input.title,position,this.now());return this.photo(this.required(this.photoRows(albumId).find(row=>row.id===id),'照片'))}
  updatePhoto(id:string,input:{title?:string;caption?:string;image?:string;imageAssetId?:string;alt?:string}){const current=this.required(this.get('SELECT * FROM photos WHERE id=?',id),'照片'),assetId=input.imageAssetId||input.image?this.assetId(input):String(current.image_asset_id);this.db.prepare('UPDATE photos SET title=?,caption=?,image_asset_id=?,alt=? WHERE id=?').run(input.title??current.title as string,input.caption??current.caption as string,assetId,input.alt??current.alt as string,id);const row=this.all('SELECT p.*,x.kind asset_kind,x.url asset_url FROM photos p JOIN assets x ON x.id=p.image_asset_id WHERE p.id=?',id)[0];return this.photo(this.required(row,'照片'))}
  orderPhotos(albumId:string,ids:string[]){const current=this.photoRows(albumId).map(row=>String(row.id));this.assertCompleteOrder(ids,current);return this.transaction(()=>{this.db.prepare('UPDATE photos SET position=position+1000 WHERE album_id=?').run(albumId);ids.forEach((id,index)=>this.db.prepare('UPDATE photos SET position=? WHERE id=?').run(index,id));return this.getAlbum(albumId)})}
  movePhoto(id:string,targetAlbumId:string,position?:number){
    return this.transaction(()=>{
      const photo=this.required(this.get('SELECT * FROM photos WHERE id=?',id),'照片')
      const sourceId=String(photo.album_id)
      this.required(this.get('SELECT id FROM albums WHERE id=?',targetAlbumId),'目标相册')
      const targetCount=this.photoRows(targetAlbumId).length
      const targetPosition=position??targetCount
      if(!Number.isInteger(targetPosition)||targetPosition<0||targetPosition>targetCount)throw new DomainError(400,'移动位置超出范围')
      this.ensureCanLosePhoto(sourceId,id)

      const sourceIds=this.photoRows(sourceId).filter(row=>row.id!==id).map(row=>String(row.id))
      const targetIds=this.photoRows(targetAlbumId).filter(row=>row.id!==id).map(row=>String(row.id))
      const references=this.all("SELECT * FROM collections WHERE type='photo' AND photo_id=?",id)
      targetIds.splice(targetPosition,0,id)

      this.prepareCoverRemoval(sourceId,id)
      this.db.prepare("DELETE FROM collections WHERE type='photo' AND photo_id=?").run(id)
      // Move positions out of the way before assigning the final order.
      this.db.prepare('UPDATE photos SET position=1000000000 WHERE id=?').run(id)
      this.db.prepare('UPDATE photos SET position=position+1000 WHERE album_id IN (?,?) AND id!=?').run(sourceId,targetAlbumId,id)
      this.db.prepare('UPDATE photos SET album_id=? WHERE id=?').run(targetAlbumId,id)
      sourceIds.forEach((photoId,index)=>this.db.prepare('UPDATE photos SET position=? WHERE id=?').run(index,photoId))
      targetIds.forEach((photoId,index)=>this.db.prepare('UPDATE photos SET position=? WHERE id=?').run(index,photoId))
      references.forEach(row=>this.db.prepare('INSERT INTO collections VALUES (?,?,?,?,?,?,?,?)').run(String(row.id),String(row.type),null,targetAlbumId,id,String(row.note),Number(row.visible),Number(row.position)))

      const row=this.all('SELECT p.*,x.kind asset_kind,x.url asset_url FROM photos p JOIN assets x ON x.id=p.image_asset_id WHERE p.id=?',id)[0]
      return this.photo(this.required(row,'照片'))
    })
  }
  deletePhoto(id:string){
    return this.transaction(()=>{
      const photo=this.required(this.get('SELECT * FROM photos WHERE id=?',id),'照片')
      const albumId=String(photo.album_id)
      if(this.get("SELECT id FROM collections WHERE type='photo' AND photo_id=?",id))throw new DomainError(409,'照片仍被收藏引用')
      this.ensureCanLosePhoto(albumId,id)

      this.prepareCoverRemoval(albumId,id)
      this.db.prepare('DELETE FROM photos WHERE id=?').run(id)
      this.photoRows(albumId).forEach((row,index)=>this.db.prepare('UPDATE photos SET position=? WHERE id=?').run(index,String(row.id)))
    })
  }
  private ensureCanLosePhoto(albumId:string,photoId:string){const album=this.required(this.get('SELECT is_private,archived_at FROM albums WHERE id=?',albumId),'相册'),count=this.photoRows(albumId).length;if(!album.is_private&&!album.archived_at&&count<=1)throw new DomainError(409,'操作不能使公开相册为空');if(!this.get('SELECT id FROM photos WHERE id=? AND album_id=?',photoId,albumId))throw new DomainError(400,'照片不属于相册')}
  private prepareCoverRemoval(albumId:string,removedId:string){const album=this.get('SELECT cover_photo_id FROM albums WHERE id=?',albumId);if(album?.cover_photo_id===removedId){const replacement=this.get('SELECT id FROM photos WHERE album_id=? AND id<>? ORDER BY position LIMIT 1',albumId,removedId);this.db.prepare('UPDATE albums SET cover_photo_id=? WHERE id=?').run(replacement?.id as string??null,albumId)}}

  collectionPresentation(){const row=this.required(this.get('SELECT default_theme,enabled_themes FROM collection_presentation WHERE singleton=1'),'收藏展示策略');return{defaultTheme:String(row.default_theme),enabledThemes:JSON.parse(String(row.enabled_themes)) as string[]}}
  collectionCatalog(){return{articles:this.articles(),albums:this.albums(),items:this.collectionItems(false),presentation:this.collectionPresentation()}}
  saveCollection(items:CollectionInput[],presentation:CollectionPresentationInput){const seen=new Set<string>();const clean=items.map(item=>{const source=item.type==='article'?item.articleId:item.type==='album'?item.albumId:item.photoId;if(!source)throw new DomainError(400,'收藏来源字段缺失');const key=`${item.type}:${source}`;if(seen.has(key))throw new DomainError(400,'同一来源最多收藏一次');seen.add(key);if(item.type==='article'){this.required(this.get('SELECT id FROM articles WHERE id=?',source),'文章');return{id:item.id??`collection-${randomUUID()}`,type:item.type,articleId:source,albumId:null,photoId:null,note:item.note??'',visible:item.visible!==false}}if(item.type==='album'){this.required(this.get('SELECT id FROM albums WHERE id=?',source),'相册');return{id:item.id??`collection-${randomUUID()}`,type:item.type,articleId:null,albumId:source,photoId:null,note:item.note??'',visible:item.visible!==false}}const photo=this.required(this.get('SELECT album_id FROM photos WHERE id=?',source),'照片');if(item.albumId&&item.albumId!==photo.album_id)throw new DomainError(400,'照片不属于指定相册');return{id:item.id??`collection-${randomUUID()}`,type:item.type,articleId:null,albumId:String(photo.album_id),photoId:source,note:item.note??'',visible:item.visible!==false}});return this.transaction(()=>{this.db.exec('DELETE FROM collections');const statement=this.db.prepare('INSERT INTO collections VALUES (?,?,?,?,?,?,?,?)');clean.forEach((item,index)=>statement.run(item.id,item.type,item.articleId,item.albumId,item.photoId,item.note,item.visible?1:0,index));this.db.prepare('UPDATE collection_presentation SET default_theme=?,enabled_themes=? WHERE singleton=1').run(presentation.defaultTheme,JSON.stringify(presentation.enabledThemes));return this.collectionCatalog()})}
  collectionItems(publicOnly:boolean){const rows=this.all('SELECT * FROM collections ORDER BY position'),articleMap=new Map(this.articleRows().map(row=>[String(row.id),row])),albumMap=new Map(this.albumRows().map(row=>[String(row.id),row]));return rows.flatMap<Record<string,unknown>>(row=>{if(publicOnly&&!row.visible)return[];if(row.type==='article'){const source=articleMap.get(String(row.article_id));if(!source||(publicOnly&&!this.isPublicArticle(source)))return[];const article=this.article(source);return[{id:row.id,type:'文章',sourceType:'article',title:article.title,meta:`${article.category} / ${article.date} / ${String(article.readingMinutes).padStart(2,'0')} 分钟`,image:article.image,alt:article.alt,href:`/articles/${article.slug}`,note:row.note,visible:Boolean(row.visible),articleId:row.article_id}]}const albumRow=albumMap.get(String(row.album_id));if(!albumRow||(publicOnly&&(albumRow.archived_at||albumRow.is_private)))return[];const album=this.album(albumRow);if(row.type==='album'){const cover=album.photos.find(photo=>photo.id===album.coverPhotoId)??album.photos[0];if(!cover)return publicOnly?[]:[{id:row.id,type:'相册',sourceType:'album',title:album.title,meta:`${album.category} / ${album.location} / 0 张照片`,image:'/assets/hero.png',alt:'',href:`/albums/${album.id}`,note:row.note,visible:Boolean(row.visible),albumId:row.album_id}];return[{id:row.id,type:'相册',sourceType:'album',title:album.title,meta:`${album.category} / ${album.location} / ${album.photos.length} 张照片`,image:cover.image,alt:cover.alt,href:`/albums/${album.id}`,note:row.note,visible:Boolean(row.visible),albumId:row.album_id}]}const photo=album.photos.find(item=>item.id===row.photo_id),index=album.photos.findIndex(item=>item.id===row.photo_id);return photo?[{id:row.id,type:'照片',sourceType:'photo',title:photo.title,meta:`《${album.title}》 / ${String(index+1).padStart(2,'0')} of ${String(album.photos.length).padStart(2,'0')} / ${album.location}`,image:photo.image,alt:photo.alt,href:`/albums/${album.id}`,note:row.note,visible:Boolean(row.visible),albumId:row.album_id,photoId:row.photo_id}]:[]})}

  createAsset(filename:string,mediaType:string,byteSize:number,path:string){const id=`asset-${randomUUID()}`;this.db.prepare('INSERT INTO assets VALUES (?,?,?,?,?, ?,NULL,?)').run(id,filename,mediaType,byteSize,'local',path,this.now());return this.assetView(id)}
  private decorateAsset(row:Row){return {...row,url:row.kind==='local'?`/api/images/${String(row.id)}`:row.url,previewUrl:row.kind==='local'?`/api/admin/images/${String(row.id)}`:row.url}}
  private assetView(id:string){return this.decorateAsset(this.required(this.get("SELECT id,filename,media_type mediaType,byte_size byteSize,kind,path,url,created_at createdAt FROM assets WHERE id=?",id),'图片资产'))}
  asset(id:string){return this.required(this.get('SELECT * FROM assets WHERE id=?',id),'图片资产')}
  publicAsset(id:string){const exposed=this.articleRows('WHERE a.image_asset_id=?',id).some(row=>this.isPublicArticle(row))||Boolean(this.get('SELECT 1 FROM photos p JOIN albums a ON a.id=p.album_id WHERE p.image_asset_id=? AND a.archived_at IS NULL AND a.is_private=0 LIMIT 1',id));if(!exposed)throw new DomainError(404,'图片资产不存在');return this.asset(id)}
  assets(){return this.all('SELECT id,filename,media_type mediaType,byte_size byteSize,kind,path,url,created_at createdAt FROM assets ORDER BY created_at DESC').map(row=>this.decorateAsset(row))}
  deleteAsset(id:string){const asset=this.asset(id);try{this.db.prepare('DELETE FROM assets WHERE id=?').run(id)}catch{throw new DomainError(409,'图片资产仍被内容引用')}return asset}
  subscribe(email:string){const normalized=email.trim().toLowerCase(),id=`subscription-${randomUUID()}`;this.db.prepare('INSERT INTO subscriptions VALUES (?,?,?) ON CONFLICT(email) DO NOTHING').run(id,normalized,this.now())}
}
