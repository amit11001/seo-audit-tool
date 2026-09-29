-- SEO Audit Tool — schema
-- MySQL 8.0+ / MariaDB 10.5+
-- Run with: npm run db:init   (or: mysql -u user -p dbname < db/schema.sql)

CREATE TABLE IF NOT EXISTS sites (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  domain        VARCHAR(255) NOT NULL,
  url           VARCHAR(2048) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sites_domain (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audits (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id       INT UNSIGNED NOT NULL,
  requested_url VARCHAR(2048) NOT NULL,
  final_url     VARCHAR(2048) NOT NULL,
  status_code   SMALLINT UNSIGNED NULL,
  score         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  grade         CHAR(1) NOT NULL DEFAULT 'F',
  ttfb_ms       INT UNSIGNED NULL,
  total_ms      INT UNSIGNED NULL,
  page_bytes    INT UNSIGNED NULL,
  word_count    INT UNSIGNED NULL,
  passed        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  warned        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  failed        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audits_site_created (site_id, created_at),
  CONSTRAINT fk_audits_site FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_checks (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_id      INT UNSIGNED NOT NULL,
  check_id      VARCHAR(64) NOT NULL,
  category      VARCHAR(48) NOT NULL,
  label         VARCHAR(160) NOT NULL,
  status        ENUM('pass','warn','fail','info') NOT NULL,
  weight        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  message       VARCHAR(500) NOT NULL,
  detail        TEXT NULL,
  fix           VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_checks_audit (audit_id),
  CONSTRAINT fk_checks_audit FOREIGN KEY (audit_id) REFERENCES audits (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS keywords (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id       INT UNSIGNED NOT NULL,
  phrase        VARCHAR(191) NOT NULL,
  intent        ENUM('transactional','commercial','informational','navigational') NOT NULL DEFAULT 'informational',
  occurrences   INT UNSIGNED NOT NULL DEFAULT 0,
  in_title      TINYINT(1) NOT NULL DEFAULT 0,
  in_h1         TINYINT(1) NOT NULL DEFAULT 0,
  in_meta       TINYINT(1) NOT NULL DEFAULT 0,
  source        ENUM('extracted','manual') NOT NULL DEFAULT 'extracted',
  notes         VARCHAR(500) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_keyword_site_phrase (site_id, phrase),
  KEY idx_keywords_site_intent (site_id, intent),
  CONSTRAINT fk_keywords_site FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
