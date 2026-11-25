import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/database.js'

describe('database migration atomicity', () => {
  it('rolls back a failed v2 migration on disk and succeeds after the conflict is removed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'migration-test-'))
    const path = join(directory, 'database.sqlite')
    try {
      const initial = new DatabaseSync(path)
      initial.exec(`
        CREATE TABLE articles(id TEXT PRIMARY KEY);
        CREATE TABLE albums(id TEXT PRIMARY KEY);
        CREATE TABLE photos(id TEXT PRIMARY KEY, album_id TEXT NOT NULL REFERENCES albums(id));
        CREATE TABLE featured(id TEXT PRIMARY KEY, type TEXT NOT NULL, article_id TEXT REFERENCES articles(id), album_id TEXT REFERENCES albums(id), photo_id TEXT REFERENCES photos(id), note TEXT NOT NULL, visible INTEGER NOT NULL, position INTEGER NOT NULL UNIQUE);
        CREATE UNIQUE INDEX featured_article_source ON featured(article_id) WHERE type='article';
        CREATE UNIQUE INDEX featured_album_source ON featured(album_id) WHERE type='album';
        CREATE UNIQUE INDEX featured_photo_source ON featured(photo_id) WHERE type='photo';
        CREATE TRIGGER featured_photo_album_insert BEFORE INSERT ON featured WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id) BEGIN SELECT RAISE(ABORT,'featured photo album mismatch'); END;
        CREATE TRIGGER featured_photo_album_update BEFORE UPDATE OF photo_id,album_id ON featured WHEN NEW.type='photo' AND NOT EXISTS(SELECT 1 FROM photos WHERE id=NEW.photo_id AND album_id=NEW.album_id) BEGIN SELECT RAISE(ABORT,'featured photo album mismatch'); END;
        INSERT INTO articles VALUES ('article-old');
        INSERT INTO featured VALUES ('featured-tool','article','article-old',NULL,NULL,'preserved',1,4);
        CREATE TABLE collection_presentation(conflict TEXT);
        PRAGMA user_version = 2;
      `)
      const schema = initial.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name='featured' ORDER BY type,name").all()
      const data = initial.prepare('SELECT * FROM featured').all()
      initial.close()

      expect(() => openDatabase(path)).toThrow(/table collection_presentation already exists/)

      const reopened = new DatabaseSync(path)
      try {
        expect(reopened.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 })
        expect(reopened.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name='featured' ORDER BY type,name").all()).toEqual(schema)
        expect(reopened.prepare('SELECT * FROM featured').all()).toEqual(data)
        expect(reopened.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collections'").get()).toBeUndefined()
        reopened.exec('DROP TABLE collection_presentation')
      } finally {
        reopened.close()
      }

      const migrated = openDatabase(path)
      try {
        expect(migrated.prepare('PRAGMA user_version').get()).toEqual({ user_version: 5 })
        expect(migrated.prepare('SELECT * FROM collections').all()).toEqual([
          { id: 'collection-tool', type: 'article', article_id: 'article-old', album_id: null, photo_id: null, note: 'preserved', visible: 1, position: 4 },
        ])
        expect(migrated.prepare('SELECT default_theme,enabled_themes FROM collection_presentation').get()).toEqual({ default_theme: 'stamp', enabled_themes: '["stamp","editorial"]' })
      } finally {
        migrated.close()
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
