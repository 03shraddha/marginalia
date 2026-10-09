-- Gloss: a signed-in reader's shelf, marks and notes, mirrored from the browser.
-- Every synced table has the same shape so one sync route serves them all:
-- rows are owned by a Clerk user id, carry the client's object as jsonb, and
-- are never hard-deleted by the app (a tombstone tells other devices).
-- Safe to run more than once.

create table if not exists articles (
  user_id text not null,
  id text not null,
  article_id text not null,
  data jsonb not null,          -- the shelf entry: title, author, words, origin
  doc jsonb,                    -- the full text; null for bundled samples and tombstones
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists highlights (
  user_id text not null,
  id text not null,
  article_id text not null,
  data jsonb not null,          -- anchor (with quote), colour, createdAt
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists glosses (
  user_id text not null,
  id text not null,
  article_id text not null,
  data jsonb not null,          -- anchor or position, action, question, turns
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists briefs (
  user_id text not null,
  id text not null,             -- the article id: one per text
  article_id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists progress (
  user_id text not null,
  id text not null,             -- the article id: one per text
  article_id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists articles_user_updated on articles (user_id, updated_at);
create index if not exists highlights_user_updated on highlights (user_id, updated_at);
create index if not exists glosses_user_updated on glosses (user_id, updated_at);
create index if not exists briefs_user_updated on briefs (user_id, updated_at);
create index if not exists progress_user_updated on progress (user_id, updated_at);
