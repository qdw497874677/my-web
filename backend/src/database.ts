import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { albums, articles, categories, collections } from './seed-data.js'
import { hashPassword } from './security.js'

export const LATEST_DATABASE_VERSION = 5

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
    migrate(db)
    return db
  } catch (error) {
    try { db.close() } catch { /* Preserve the setup error. */ }
    throw error
  }
}

function migrateVersion(db: DatabaseSync, sql: string): void {
  db.exec('BEGIN')
  try {
    db.exec(sql)
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* Preserve the migration error. */ }
    throw error
  }
}

export function migrate(db: DatabaseSync): void {
  const version = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  if (version > LATEST_DATABASE_VERSION) throw new Error(`不支持的数据库版本: ${version}`)
  if (version === 0) migrateVersion(db, `
    CREATE TABLE owners(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE sessions(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
    CREATE TABLE categories(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, position INTEGER NOT NULL UNIQUE);
    CREATE TABLE assets(id TEXT PRIMARY KEY, filename TEXT NOT NULL, media_type TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK(byte_size>=0), kind TEXT NOT NULL CHECK(kind IN ('local','external')), path TEXT, url TEXT, created_at TEXT NOT NULL, CHECK((kind='local' AND path IS NOT NULL AND url IS NULL) OR (kind='external' AND url IS NOT NULL AND path IS NULL)));
    CREATE TABLE articles(id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id), date TEXT NOT NULL, reading_minutes INTEGER NOT NULL CHECK(reading_minutes>=0), image_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT, alt TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published','scheduled')), scheduled_at TEXT, pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)), archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK((status='scheduled' AND scheduled_at IS NOT NULL) OR (status!='scheduled' AND scheduled_at IS NULL)));
    CREATE TABLE article_slugs(slug TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE);
    CREATE TABLE albums(id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id), location TEXT NOT NULL, date TEXT NOT NULL, cover_photo_id TEXT, is_private INTEGER NOT NULL DEFAULT 1 CHECK(is_private IN (0,1)), archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE photos(id TEXT PRIMARY KEY, album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE, title TEXT NOT NULL, caption TEXT NOT NULL, image_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT, alt TEXT NOT NULL, position INTEGER NOT NULL CHECK(position>=0), created_at TEXT NOT NULL, UNIQUE(album_id,position));
    CREATE TABLE featured(id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('article','album','photo')), article_id TEXT REFERENCES articles(id), album_id TEXT REFERENCES albums(id), photo_id TEXT REFERENCES photos(id), note TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)), position INTEGER NOT NULL UNIQUE, CHECK((type='article' AND article_id IS NOT NULL AND album_id IS NULL AND photo_id IS NULL) OR (type='album' AND article_id IS NULL AND album_id IS NOT NULL AND photo_id IS NULL) OR (type='photo' AND article_id IS NULL AND album_id IS NOT NULL AND photo_id IS NOT NULL)));
    CREATE UNIQUE INDEX featured_article_source ON featured(article_id) WHERE type='article';
    CREATE UNIQUE INDEX featured_album_source ON featured(album_id) WHERE type='album';
    CREATE UNIQUE INDEX featured_photo_source ON featured(photo_id) WHERE type='photo';
    CREATE TABLE subscriptions(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    PRAGMA user_version = 1;
  `)
  if (version < 2) migrateVersion(db, `
    INSERT OR IGNORE INTO assets VALUES ('asset-builtin-cta','cta.png','image/png',0,'external',NULL,'/assets/cta.png',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    INSERT OR IGNORE INTO assets VALUES ('asset-builtin-hero','hero.png','image/png',0,'external',NULL,'/assets/hero.png',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

    CREATE TRIGGER album_cover_insert BEFORE INSERT ON albums
    WHEN NEW.cover_photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.cover_photo_id AND album_id=NEW.id)
    BEGIN SELECT RAISE(ABORT,'album cover must belong to album'); END;
    CREATE TRIGGER album_cover_update BEFORE UPDATE OF cover_photo_id ON albums
    WHEN NEW.cover_photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.cover_photo_id AND album_id=NEW.id)
    BEGIN SELECT RAISE(ABORT,'album cover must belong to album'); END;
    CREATE TRIGGER featured_photo_album_insert BEFORE INSERT ON featured
    WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id)
    BEGIN SELECT RAISE(ABORT,'featured photo album mismatch'); END;
    CREATE TRIGGER featured_photo_album_update BEFORE UPDATE OF photo_id,album_id ON featured
    WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id)
    BEGIN SELECT RAISE(ABORT,'featured photo album mismatch'); END;
    CREATE TRIGGER album_public_nonempty_update BEFORE UPDATE OF is_private,archived_at ON albums
    WHEN NEW.is_private=0 AND NEW.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM photos WHERE album_id=NEW.id)
    BEGIN SELECT RAISE(ABORT,'public album must not be empty'); END;
    CREATE TRIGGER album_public_nonempty_insert BEFORE INSERT ON albums
    WHEN NEW.is_private=0 AND NEW.archived_at IS NULL
    BEGIN SELECT RAISE(ABORT,'public album must not be empty'); END;
    CREATE TRIGGER photo_last_delete BEFORE DELETE ON photos
    WHEN EXISTS(SELECT 1 FROM albums WHERE id=OLD.album_id AND is_private=0 AND archived_at IS NULL)
      AND (SELECT COUNT(*) FROM photos WHERE album_id=OLD.album_id)=1
    BEGIN SELECT RAISE(ABORT,'public album must not be empty'); END;
    CREATE TRIGGER photo_last_move BEFORE UPDATE OF album_id ON photos
    WHEN NEW.album_id<>OLD.album_id
      AND EXISTS(SELECT 1 FROM albums WHERE id=OLD.album_id AND is_private=0 AND archived_at IS NULL)
      AND (SELECT COUNT(*) FROM photos WHERE album_id=OLD.album_id)=1
    BEGIN SELECT RAISE(ABORT,'public album must not be empty'); END;
    CREATE TRIGGER photo_cover_move BEFORE UPDATE OF album_id ON photos
    WHEN NEW.album_id<>OLD.album_id AND EXISTS(SELECT 1 FROM albums WHERE id=OLD.album_id AND cover_photo_id=OLD.id)
    BEGIN SELECT RAISE(ABORT,'move album cover after selecting replacement'); END;
    CREATE TRIGGER photo_cover_delete BEFORE DELETE ON photos
    WHEN EXISTS(SELECT 1 FROM albums WHERE id=OLD.album_id AND cover_photo_id=OLD.id)
    BEGIN SELECT RAISE(ABORT,'delete album cover after selecting replacement'); END;
    PRAGMA user_version = 2;
  `)
  if (version < 3) migrateVersion(db, `
    DROP TRIGGER IF EXISTS featured_photo_album_insert;
    DROP TRIGGER IF EXISTS featured_photo_album_update;
    DROP INDEX IF EXISTS featured_article_source;
    DROP INDEX IF EXISTS featured_album_source;
    DROP INDEX IF EXISTS featured_photo_source;
    ALTER TABLE featured RENAME TO collections;
    UPDATE OR IGNORE collections SET id=CASE id
      WHEN 'featured-tool' THEN 'collection-tool'
      WHEN 'featured-river' THEN 'collection-river'
      WHEN 'featured-window-photo' THEN 'collection-window-photo'
      WHEN 'featured-rain' THEN 'collection-rain'
      WHEN 'featured-desk-photo' THEN 'collection-desk-photo'
      WHEN 'featured-walk' THEN 'collection-walk'
      ELSE id
    END;
    CREATE UNIQUE INDEX collection_article_source ON collections(article_id) WHERE type='article';
    CREATE UNIQUE INDEX collection_album_source ON collections(album_id) WHERE type='album';
    CREATE UNIQUE INDEX collection_photo_source ON collections(photo_id) WHERE type='photo';
    CREATE TRIGGER collection_photo_album_insert BEFORE INSERT ON collections
    WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id)
    BEGIN SELECT RAISE(ABORT,'collection photo album mismatch'); END;
    CREATE TRIGGER collection_photo_album_update BEFORE UPDATE OF photo_id,album_id ON collections
    WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id)
    BEGIN SELECT RAISE(ABORT,'collection photo album mismatch'); END;
    CREATE TABLE collection_presentation(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      default_theme TEXT NOT NULL CHECK(default_theme IN ('stamp','editorial')),
      enabled_themes TEXT NOT NULL,
      CHECK(
        (default_theme='stamp' AND enabled_themes IN ('["stamp"]','["stamp","editorial"]','["editorial","stamp"]'))
        OR (default_theme='editorial' AND enabled_themes IN ('["editorial"]','["stamp","editorial"]','["editorial","stamp"]'))
      )
    );
    INSERT INTO collection_presentation VALUES (1,'stamp','["stamp","editorial"]');
    PRAGMA user_version = 3;
  `)
  if (version < 4) migrateVersion(db, `
        ALTER TABLE collection_presentation RENAME TO collection_presentation_v3;
        CREATE TABLE collection_presentation(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          default_theme TEXT NOT NULL CHECK(default_theme IN ('stamp','editorial','holographic')),
          enabled_themes TEXT NOT NULL CHECK(json_valid(enabled_themes) AND json_array_length(enabled_themes)>0)
        );
        INSERT INTO collection_presentation SELECT * FROM collection_presentation_v3;
        DROP TABLE collection_presentation_v3;
        CREATE TRIGGER collection_presentation_insert BEFORE INSERT ON collection_presentation
        WHEN EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value NOT IN ('stamp','editorial','holographic'))
          OR (SELECT COUNT(*) FROM json_each(NEW.enabled_themes))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.enabled_themes))
          OR NOT EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value=NEW.default_theme)
        BEGIN SELECT RAISE(ABORT,'invalid collection presentation'); END;
        CREATE TRIGGER collection_presentation_update BEFORE UPDATE ON collection_presentation
        WHEN EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value NOT IN ('stamp','editorial','holographic'))
          OR (SELECT COUNT(*) FROM json_each(NEW.enabled_themes))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.enabled_themes))
          OR NOT EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value=NEW.default_theme)
        BEGIN SELECT RAISE(ABORT,'invalid collection presentation'); END;
        PRAGMA user_version = 4;
  `)
  if (version < 5) migrateVersion(db, `
        DROP TRIGGER IF EXISTS collection_presentation_insert;
        DROP TRIGGER IF EXISTS collection_presentation_update;
        ALTER TABLE collection_presentation RENAME TO collection_presentation_v4;
        CREATE TABLE collection_presentation(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          default_theme TEXT NOT NULL CHECK(default_theme IN ('stamp','editorial','holographic','cinema','boarding')),
          enabled_themes TEXT NOT NULL CHECK(json_valid(enabled_themes) AND json_array_length(enabled_themes)>0)
        );
        INSERT INTO collection_presentation SELECT * FROM collection_presentation_v4;
        DROP TABLE collection_presentation_v4;
        CREATE TRIGGER collection_presentation_insert BEFORE INSERT ON collection_presentation
        WHEN EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value NOT IN ('stamp','editorial','holographic','cinema','boarding'))
          OR (SELECT COUNT(*) FROM json_each(NEW.enabled_themes))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.enabled_themes))
          OR NOT EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value=NEW.default_theme)
        BEGIN SELECT RAISE(ABORT,'invalid collection presentation'); END;
        CREATE TRIGGER collection_presentation_update BEFORE UPDATE ON collection_presentation
        WHEN EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value NOT IN ('stamp','editorial','holographic','cinema','boarding'))
          OR (SELECT COUNT(*) FROM json_each(NEW.enabled_themes))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.enabled_themes))
          OR NOT EXISTS(SELECT 1 FROM json_each(NEW.enabled_themes) WHERE value=NEW.default_theme)
        BEGIN SELECT RAISE(ABORT,'invalid collection presentation'); END;
        PRAGMA user_version = 5;
  `)
}

export function hasOwner(db: DatabaseSync): boolean {
  return Number((db.prepare('SELECT COUNT(*) AS count FROM owners').get() as { count: number }).count) === 1
}

export async function initializeOwner(db: DatabaseSync, email: string, password: string, at = new Date()): Promise<void> {
  const count = Number((db.prepare('SELECT COUNT(*) AS count FROM owners').get() as { count: number }).count)
  if (count) throw new Error('所有者账户已经初始化')
  db.prepare('INSERT INTO owners VALUES (?, ?, ?, ?)').run('owner', email.trim().toLowerCase(), await hashPassword(password), at.toISOString())
}

export function seedContent(db: DatabaseSync, at = new Date()): void {
  if (Number((db.prepare('SELECT COUNT(*) AS count FROM categories').get() as { count: number }).count)) return
  db.exec('BEGIN')
  try {
    const timestamp = at.toISOString()
    const assetByUrl = new Map<string,string>()
    const externalAsset = (url: string) => {
      const existing = assetByUrl.get(url)
      if (existing) return existing
      const registered = db.prepare("SELECT id FROM assets WHERE kind='external' AND url=?").get(url) as { id: string } | undefined
      if (registered) { assetByUrl.set(url,registered.id); return registered.id }
      const id = `asset-preloaded-${url.replace(/^\/assets\//,'').replace(/[^a-z0-9]+/gi,'-')}`
      db.prepare('INSERT INTO assets VALUES (?, ?, ?, 0, ?, NULL, ?, ?)').run(id, url.split('/').at(-1) ?? id, 'image/png', 'external', url, timestamp)
      assetByUrl.set(url,id)
      return id
    }
    const categoryStatement = db.prepare('INSERT INTO categories VALUES (?, ?, ?)')
    categories.forEach(([id,name],position)=>categoryStatement.run(id,name,position))
    const articleStatement = db.prepare('INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    articles.forEach(([id,slug,title,excerpt,categoryId,date,minutes,image,alt,status,scheduledAt,pinned])=>articleStatement.run(id,slug,title,excerpt,categoryId,date,minutes,externalAsset(image),alt,`# ${title}\n\n${excerpt}`,status,scheduledAt,pinned,timestamp,timestamp))
    const albumStatement = db.prepare('INSERT INTO albums VALUES (?, ?, ?, ?, ?, ?, NULL, 1, NULL, ?, ?)')
    const photoStatement = db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    albums.forEach(([id,title,description,categoryId,location,date,cover,isPrivate,photos])=>{ albumStatement.run(id,title,description,categoryId,location,date,timestamp,timestamp); photos.forEach(([photoId,photoTitle,caption,image,alt],position)=>photoStatement.run(photoId,id,photoTitle,caption,externalAsset(image),alt,position,timestamp)); db.prepare('UPDATE albums SET cover_photo_id=?,is_private=? WHERE id=?').run(cover,isPrivate,id) })
    const collectionStatement=db.prepare('INSERT INTO collections VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
    collections.forEach(([id,type,articleId,albumId,photoId,note],position)=>collectionStatement.run(id,type,articleId,albumId,photoId,note,position))
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
