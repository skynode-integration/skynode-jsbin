/*
-- Table structure for table `owner_bookmarks`
--*/
CREATE TABLE IF NOT EXISTS `owner_bookmarks` (
  `id` INTEGER NOT NULL NULL PRIMARY KEY AUTOINCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `url` VARCHAR(255) NOT NULL,
  `revision` INTEGER NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `created` DATETIME NOT NULL
);

/*
-- Table structure for table `owners`
--*/
CREATE TABLE IF NOT EXISTS `owners` (
  `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  `name` VARCHAR(75) NOT NULL,
  `url` VARCHAR(255) NOT NULL,
  `revision` INTEGER DEFAULT '1',
  `last_updated` DATETIME DEFAULT NULL,
  `summary` VARCHAR(255) NOT NULL DEFAULT '',
  `html` INTEGER DEFAULT '0',
  `css` INTEGER DEFAULT '0',
  `javascript` INTEGER DEFAULT '0',
  `archive` INTEGER DEFAULT '0',
  `visibility` VARCHAR(255) DEFAULT 'public' NOT NULL
);


/*
-- Table structure for table `sandbox`
--*/
CREATE TABLE IF NOT EXISTS `sandbox` (
  `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  `javascript` TEXT NOT NULL DEFAULT "",
  `html` TEXT NOT NULL DEFAULT "",
  `created` DATETIME DEFAULT NULL,
  `last_viewed` DATETIME DEFAULT NULL,
  `url` VARCHAR(255) DEFAULT NULL,
  `active` VARCHAR(1) DEFAULT 'y',
  `reported` DATETIME DEFAULT NULL,
  `streaming` VARCHAR(1) DEFAULT 'n',
  `streaming_key` VARCHAR(32),
  `streaming_read_key` VARCHAR(32),
  `active_tab` VARCHAR(10),
  `active_cursor` INTEGER,
  `revision` INTEGER DEFAULT '1',
  `css` TEXT NOT NULL DEFAULT "",
  `settings` TEXT NOT NULL DEFAULT ''
);


CREATE INDEX IF NOT EXISTS "sandbox_viewed" ON "sandbox" (`last_viewed`);
CREATE INDEX IF NOT EXISTS "sandbox_url" ON "sandbox" (`url`);
CREATE INDEX IF NOT EXISTS "sandbox_streaming_key" ON "sandbox" (`streaming_key`);
CREATE INDEX IF NOT EXISTS "sandbox_spam" ON "sandbox" (`created`,`last_viewed`);
CREATE INDEX IF NOT EXISTS "sandbox_revision" ON "sandbox" (`url`,`revision`);

CREATE INDEX IF NOT EXISTS "owners_name_url" ON "owners" (`name`,`url`,`revision`);
CREATE INDEX IF NOT EXISTS "owners_last_updated" ON "owners" (`name`,`last_updated`);
CREATE INDEX IF NOT EXISTS "owners_url" ON "owners" (`url`,`revision`);

CREATE INDEX IF NOT EXISTS "owner_bookmarks_name" ON "owner_bookmarks" (`name`,`type`,`created`);  
CREATE INDEX IF NOT EXISTS "owner_bookmarks_revision" ON "owner_bookmarks" (`url`,`revision`);
