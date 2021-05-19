/*
-- Table structure for table `assets`
--*/
CREATE TABLE IF NOT EXISTS `assets` (
  `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  `username` VARCHAR(255) NOT NULL,
  `asset_url` VARCHAR(255) NOT NULL,
  `size` INTEGER NOT NULL,
  `mime` VARCHAR(255) NOT NULL
);

/*
-- Table structure for table `customers`
--*/
CREATE TABLE IF NOT EXISTS `customers` (
  `stripe_id` VARCHAR(255) NOT NULL,
  `id` INTEGER NOT NULL NULL PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `expiry` DATETIME DEFAULT NULL,
  `active` INTEGER DEFAULT '1',
  `plan` VARCHAR(255) DEFAULT NULL
);

/*
-- Table structure for table `forgot_tokens`
--*/
CREATE TABLE IF NOT EXISTS `forgot_tokens` (
  `owner_name` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `expires` DATETIME NOT NULL,
  `created` DATETIME NOT NULL
);

/*
-- Table structure for table `ownership`
--*/
CREATE TABLE IF NOT EXISTS `ownership` (
  `name` VARCHAR(50) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `last_login` DATETIME NOT NULL,
  `created` DATETIME NOT NULL,
  `updated` DATETIME NOT NULL,
  `api_key` VARCHAR(255) NULL,
  `github_token` VARCHAR(255) NULL,
  `github_id` INTEGER NULL,
  `verified` INTEGER NOT NULL DEFAULT '0',
  `pro` INTEGER NOT NULL DEFAULT '0',
  `id` INTEGER NOT NULL NULL PRIMARY KEY AUTOINCREMENT,
  `settings` TEXT,
  `access_token` VARCHAR(255) DEFAULT NULL,
  `dropbox_token` VARCHAR(255) DEFAULT NULL,
  `dropbox_id` INTEGER DEFAULT NULL,
  `beta` INTEGER DEFAULT NULL,
  `flagged` VARCHAR(16) DEFAULT NULL,
  `last_seen` DATETIME DEFAULT NULL  
);

/*
-- Table structure for table `passports`
--*/
CREATE TABLE IF NOT EXISTS `passports` (
  `owner_name` VARCHAR(50) NOT NULL,
  `auth_provider` VARCHAR(255) NOT NULL, /*认证机构，例如：github，dropbox，google，facebook，wechat，qq*/
  `auth_id` INTEGER NULL,
  `auth_token` VARCHAR(255) NULL,
  `created` DATETIME NOT NULL,
  `updated` DATETIME NOT NULL,
  `id` INTEGER NOT NULL NULL PRIMARY KEY AUTOINCREMENT
);


CREATE VIEW  IF NOT EXISTS `ownership2` AS  
SELECT 
A.name,
A.key,
A.email,
A.last_login,
A.created,
A.updated,
A.api_key,
B.auth_token as `github_token`,
B.auth_id as `github_id`,
A.verified,
A.pro,
A.id,
A.settings,
C.auth_token as `dropbox_token`,
C.auth_id  as `dropbox_id`,
A.beta,A.flagged,A.last_seen 
FROM ownership A
LEFT OUTER JOIN passports B on A.name = B.owner_name and B.auth_provider =  'github'
LEFT OUTER JOIN passports C on A.name = C.owner_name and B.auth_provider =  'dropbox'
;


CREATE INDEX IF NOT EXISTS "ownership_name_key" ON "ownership" (`name`,`key`);
CREATE INDEX IF NOT EXISTS "ownership_created" ON "ownership" (`created`);
CREATE INDEX IF NOT EXISTS "ownership_api_key" ON "ownership" (`api_key`);
CREATE INDEX IF NOT EXISTS "ownership_last_seen" ON "ownership" (`last_seen`);

CREATE INDEX IF NOT EXISTS "forgot_tokens_expires" ON "forgot_tokens" (`expires`);  
CREATE INDEX IF NOT EXISTS "forgot_tokens_token_expires" ON "forgot_tokens" (`token`,`created`, `expires`);  

CREATE INDEX IF NOT EXISTS "customers_stripe_id" ON "customers" (`stripe_id`);
CREATE INDEX IF NOT EXISTS "customers_name" ON "customers" (`name`);
CREATE INDEX IF NOT EXISTS "customers_user_id" ON "customers" (`user_id`);
CREATE INDEX IF NOT EXISTS "customers_expired" ON "customers" (`expiry`,`active`);

CREATE INDEX IF NOT EXISTS "assets_asset_url" ON "assets" (`asset_url`);  
CREATE INDEX IF NOT EXISTS "assets_username" ON "assets" (`username`);
