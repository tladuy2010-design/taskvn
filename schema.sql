CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 1,
 title TEXT NOT NULL,
 short_url TEXT NOT NULL,
 reward INTEGER NOT NULL CHECK(reward>=0),
 daily_limit INTEGER NOT NULL DEFAULT 1 CHECK(daily_limit>0),
 claim_ttl_seconds INTEGER NOT NULL DEFAULT 1800,
 created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_claims (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL,
 uid TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER
);

CREATE TABLE IF NOT EXISTS task_completions (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL,
 uid TEXT NOT NULL,
 claim_id TEXT NOT NULL UNIQUE,
 reward INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
 id TEXT PRIMARY KEY,
 uid TEXT NOT NULL,
 type TEXT NOT NULL,
 amount INTEGER NOT NULL,
 ref_id TEXT,
 created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claim_uid ON task_claims(uid,created_at);
CREATE INDEX IF NOT EXISTS idx_completion_task_uid_time ON task_completions(task_id,uid,created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_uid_time ON ledger(uid,created_at);

CREATE INDEX IF NOT EXISTS idx_claim_status ON task_claims(status,expires_at);

CREATE TABLE IF NOT EXISTS payout_requests (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL, method TEXT NOT NULL,
 amount INTEGER NOT NULL, name TEXT NOT NULL, target TEXT NOT NULL,
 bank TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
 reviewed_at INTEGER, reviewed_by TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS idx_payout_uid ON payout_requests(uid,created_at);
CREATE INDEX IF NOT EXISTS idx_payout_status ON payout_requests(status,created_at);

CREATE TABLE IF NOT EXISTS shop_topups (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL, shop_account TEXT NOT NULL,
 amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at INTEGER NOT NULL, paid_at INTEGER, note TEXT
);
CREATE INDEX IF NOT EXISTS idx_shop_topups_uid ON shop_topups(uid,created_at);
CREATE INDEX IF NOT EXISTS idx_shop_topups_status ON shop_topups(status,created_at);
