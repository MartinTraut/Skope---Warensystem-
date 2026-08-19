-- SKOPE Warensystem — Umbau vom Scooter- auf das Artikelmodell
--
-- Das erste Schema kannte genau ein Ding: den Scooter. Prüfung, Aufbereitung
-- und Dokumente hingen als Spalten daran, Ersatzteile gab es nicht, Bestand
-- war implizit („ein Scooter ist eins"). Die Anwendung führt inzwischen
-- Artikel (Sorte) und Einzelstücke (Gerät) getrennt, kennt Mengen,
-- Lagerplätze, ein Bewegungsjournal, Ausschlachtungen und eine Freigabeliste.
--
-- Diese Migration baut das Schema auf dieses Modell um. Sie legt die alten
-- Tabellen ab: Sie waren leer — der Prototyp hält seine Daten im Browser, in
-- die Datenbank wurde nie geschrieben. Wäre dort Bestand gewesen, stünde hier
-- eine Übernahme statt eines DROP.
--
-- Zwei Regeln gelten wie zuvor: Geldbeträge sind ganze Cent (integer), nie
-- Fließkomma. Bezeichner sind lowercase snake_case; die TypeScript-Schicht
-- mappt camelCase darauf.

/* ------------------------------------------------------------------ */
/* Altes Modell abräumen                                               */
/* ------------------------------------------------------------------ */

drop table if exists public.inspection_checks cascade;
drop table if exists public.inspection_check_definitions cascade;
drop table if exists public.repairs cascade;
drop table if exists public.scooter_images cascade;
drop table if exists public.listings cascade;
drop table if exists public.sales cascade;
drop table if exists public.audit_events cascade;
drop table if exists public.import_issues cascade;
drop table if exists public.import_batches cascade;
drop table if exists public.import_column_mappings cascade;
drop table if exists public.scooters cascade;

drop type if exists public.audit_category cascade;
drop type if exists public.workflow_status cascade;
drop type if exists public.import_source cascade;
drop type if exists public.channel cascade;
drop type if exists public.sale_channel cascade;

/* ------------------------------------------------------------------ */
/* Enums — spiegeln die Unions aus lib/domain/types.ts                 */
/* ------------------------------------------------------------------ */

-- Neu: Eine Kategorie führt entweder Geräte oder Mengen. Nicht vererbbar,
-- nicht nachträglich änderbar — siehe articles.stock_mode.
create type stock_mode as enum ('SERIALISIERT', 'MENGE');

-- Neu angelegt statt erweitert: `alter type ... add value` darf innerhalb
-- derselben Transaktion nicht verwendet werden, und der einzige Träger des
-- alten Typs (scooters) ist oben ohnehin entfallen.
--
-- Ergänzt um AUSGESCHLACHTET: Ein zerlegtes Gerät ist weder verkauft noch
-- archiviert, sein Einkaufswert liegt jetzt auf den entnommenen Teilen.
drop type if exists public.workflow_status cascade;

create type workflow_status as enum (
  'EINGEGANGEN', 'IN_PRUEFUNG', 'AUFBEREITUNG', 'VERKAUFSBEREIT',
  'AUSGESCHLACHTET', 'ARCHIVIERT'
);

create type channel as enum ('SHOPIFY', 'EBAY', 'KLEINANZEIGEN');

create type sale_channel as enum (
  'SHOPIFY', 'EBAY', 'KLEINANZEIGEN', 'VOR_ORT', 'TELEFON', 'SONSTIGE'
);

create type attribute_type as enum ('TEXT', 'ZAHL', 'AUSWAHL', 'JA_NEIN');

create type publish_mode as enum ('AUTOMATISCH', 'VORSCHLAG', 'MANUELL');

-- Vorzeichen und Wirkung stehen im Anwendungscode; der Typ benennt nur den
-- Grund. Warum die Menge sich geändert hat, ist die eigentliche Auskunft
-- eines Lagers — „minus drei" allein hilft niemandem.
create type movement_type as enum (
  'ZUGANG', 'AUSSCHLACHTUNG', 'VERKAUF', 'VERBRAUCH',
  'KORREKTUR', 'UMLAGERUNG', 'VERLUST'
);

create type teardown_distribution as enum ('GLEICH', 'NACH_WERT', 'MANUELL');
create type teardown_status as enum ('ENTWURF', 'GEBUCHT');

create type proposal_status as enum ('OFFEN', 'FREIGEGEBEN', 'ABGELEHNT');

create type audit_category as enum (
  'ARTIKEL', 'BESTAND', 'AUSSCHLACHTUNG', 'PRUEFUNG', 'AUFBEREITUNG',
  'BILDER', 'KANAL', 'VERKAUF', 'SYNC', 'IMPORT', 'KATEGORIE', 'SYSTEM'
);

create type import_source as enum ('DEMO', 'DATEI');

/* ------------------------------------------------------------------ */
/* Bereiche (Kategorien)                                               */
/* ------------------------------------------------------------------ */

-- Der Baum, an dem alles andere hängt. Was hier null ist, erbt der Zweig vom
-- übergeordneten Bereich; Merkmalsfelder sammeln sich über den Pfad an, statt
-- überschrieben zu werden (siehe lib/domain/categories.ts).
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null,
  number_prefix text not null default '',
  description text not null default '',

  -- Nicht vererbbar und nicht null: Ein Bereich, der beides führt, hätte
  -- weder eine sinnvolle Bestandsrechnung noch eine sinnvolle Nummer.
  stock_mode stock_mode not null,

  -- Liste aus AttributeDefinition. Freiformig je Bereich, deshalb jsonb.
  attributes jsonb not null default '[]'::jsonb,

  reorder_level integer check (reorder_level >= 0),
  default_channel channel,
  publish_mode publish_mode,
  requires_inspection boolean,

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_parent_id_idx on public.categories (parent_id, sort_order);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- Ein Bereich darf nicht sein eigener Vorfahr sein: Ein Zyklus im Baum
-- bringt jede Vererbungsrechnung zum Endlosdurchlauf.
create or replace function public.categories_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  walker uuid := new.parent_id;
  hops integer := 0;
begin
  while walker is not null loop
    if walker = new.id then
      raise exception 'Bereich % wäre sein eigener Übergeordneter', new.id;
    end if;
    select parent_id into walker from public.categories where id = walker;
    hops := hops + 1;
    if hops > 64 then
      raise exception 'Bereichsbaum zu tief oder zyklisch';
    end if;
  end loop;
  return new;
end;
$$;

create trigger categories_no_cycle
  before insert or update of parent_id on public.categories
  for each row execute function public.categories_no_cycle();

/* ------------------------------------------------------------------ */
/* Lagerplätze                                                         */
/* ------------------------------------------------------------------ */

-- Bewusst getrennt von der Artikelnummer: Wandert eine Kiste in ein anderes
-- Regal, ist das eine Umlagerungsbuchung — und keine neue Nummer.
create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default '',
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source import_source not null,
  category_id uuid references public.categories (id) on delete set null,
  category_label text not null default '',
  stock_mode stock_mode not null,
  rows_total integer not null default 0,
  rows_imported integer not null default 0,
  rows_skipped integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create table public.import_issues (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_number integer not null,
  -- Seriennummer, Teilenummer oder Bezeichnung — je nachdem, woran die Zeile
  -- erkennbar war. Deshalb neutral „reference".
  reference text not null default '',
  reason text not null,
  severity issue_severity not null
);

create index import_issues_batch_id_idx on public.import_issues (batch_id);

-- Spalten-Mapping je Bereich statt global: Eine Ersatzteilliste und eine
-- Geräteliste haben nicht dieselben Spalten.
create table public.import_column_mappings (
  category_id uuid not null references public.categories (id) on delete cascade,
  target text not null,
  source text not null default '',
  updated_at timestamptz not null default now(),
  primary key (category_id, target)
);

/* ------------------------------------------------------------------ */
/* Artikel — die Sorte                                                 */
/* ------------------------------------------------------------------ */

-- Ein Artikel benennt die Sorte, nicht das Stück: 40 Bremsbeläge teilen sich
-- einen Datensatz. Bei stock_mode = 'SERIALISIERT' hängen die Geräte als
-- article_units daran; bei 'MENGE' liegt der Bestand als Summe der Buchungen
-- am Artikel selbst.
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  category_id uuid not null references public.categories (id) on delete restrict,

  name text not null default '',
  manufacturer text not null default '',
  mpn text not null default '',
  ean text not null default '',

  -- Aus dem Bereich geerbt und beim Anlegen festgeschrieben. Ein
  -- nachträglicher Wechsel würde den gesamten Bestand bedeutungslos machen:
  -- aus 40 Bremsbelägen würden 40 einzeln zu prüfende Geräte.
  stock_mode stock_mode not null,

  description text not null default '',
  attributes jsonb not null default '{}'::jsonb,

  condition condition not null default 'GUT',
  sale_price_cents integer check (sale_price_cents >= 0),

  reorder_level integer check (reorder_level >= 0),
  channel_override channel,
  publish_mode_override publish_mode,

  notes text not null default '',
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index articles_category_id_idx on public.articles (category_id);
create index articles_stock_mode_idx on public.articles (stock_mode);
create index articles_updated_at_idx on public.articles (updated_at desc);

-- Die Teilenummer ist innerhalb ihres Bereichs eindeutig, nicht global:
-- Dieselbe MPN kann in zwei Bereichen etwas anderes bezeichnen. Leere
-- Angaben blockieren nichts.
create unique index articles_mpn_per_category_key
  on public.articles (category_id, upper(mpn))
  where mpn <> '';

create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Einzelstücke — das Gerät                                            */
/* ------------------------------------------------------------------ */

create table public.article_units (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete restrict,
  unit_number text not null unique,
  serial_number text not null default '',

  variant text not null default '',
  color text not null default '',
  mileage_km integer not null default 0 check (mileage_km >= 0),
  condition condition not null default 'GUT',
  description text not null default '',
  attributes jsonb not null default '{}'::jsonb,

  purchase_price_cents integer not null default 0 check (purchase_price_cents >= 0),
  additional_costs_cents integer not null default 0 check (additional_costs_cents >= 0),
  sale_price_cents integer check (sale_price_cents >= 0),

  purchase_date date,
  arrival_date date,

  location_id uuid references public.storage_locations (id) on delete set null,
  notes text not null default '',

  workflow_status workflow_status not null default 'EINGEGANGEN',
  status_sale sale_status not null default 'VERFUEGBAR',

  -- Dokumentenlage
  doc_abe boolean not null default false,
  doc_invoice boolean not null default false,
  doc_other boolean not null default false,
  doc_note text not null default '',

  inspection_completed_at timestamptz,
  inspection_completed_by text,
  inspection_note text not null default '',

  cleaning_done boolean not null default false,
  cleaning_done_at timestamptz,
  cleaning_note text not null default '',

  teardown_id uuid,
  import_batch_id uuid references public.import_batches (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seriennummern sind nur dort eindeutig, wo sie gepflegt sind. Verglichen
-- wird normalisiert, weil „SN-1234", „sn 1234" und „SN1234" dasselbe Gerät
-- meinen — genauso wie normalizeReference() im Anwendungscode.
create unique index article_units_serial_number_key
  on public.article_units (upper(regexp_replace(serial_number, '[\s\-_./]', '', 'g')))
  where serial_number <> '';

create index article_units_article_id_idx on public.article_units (article_id);
create index article_units_workflow_status_idx on public.article_units (workflow_status);
create index article_units_location_id_idx on public.article_units (location_id);

create trigger article_units_set_updated_at
  before update on public.article_units
  for each row execute function public.set_updated_at();

-- Geräte gibt es nur zu serialisierten Artikeln. Ohne diese Prüfung entsteht
-- ein Gerät zu einem Mengenartikel — und damit ein Bestand, den weder die
-- Gerätezählung noch das Buchungsjournal vollständig kennt.
create or replace function public.article_units_require_serialized()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  mode public.stock_mode;
begin
  select stock_mode into mode from public.articles where id = new.article_id;
  if mode is distinct from 'SERIALISIERT' then
    raise exception 'Artikel % wird als Menge geführt und kann kein Einzelstück aufnehmen', new.article_id;
  end if;
  return new;
end;
$$;

create trigger article_units_require_serialized
  before insert or update of article_id on public.article_units
  for each row execute function public.article_units_require_serialized();

/* ------------------------------------------------------------------ */
/* Prüfung                                                             */
/* ------------------------------------------------------------------ */

-- Prüfpunkte als Daten, nicht als Spalten: ein neuer Punkt ist damit eine
-- Konfigurationsänderung und keine Migration. Neu gegenüber dem alten
-- Schema ist die Bindung an einen Bereich: Ein Akku wird anders geprüft als
-- ein Scooter, und ein fester Katalog passt nur zu einem einzigen Produkt.
create table public.inspection_check_definitions (
  key text primary key,
  category_id uuid references public.categories (id) on delete cascade,
  label text not null,
  critical boolean not null default false,
  check_group inspection_group not null,
  sort_order integer not null default 0
);

create index inspection_check_definitions_category_idx
  on public.inspection_check_definitions (category_id, sort_order);

create table public.inspection_checks (
  unit_id uuid not null references public.article_units (id) on delete cascade,
  check_key text not null references public.inspection_check_definitions (key) on delete cascade,
  result inspection_result not null default 'NICHT_GEPRUEFT',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (unit_id, check_key)
);

create index inspection_checks_check_key_idx on public.inspection_checks (check_key);

create trigger inspection_checks_set_updated_at
  before update on public.inspection_checks
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Aufbereitung                                                        */
/* ------------------------------------------------------------------ */

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.article_units (id) on delete cascade,
  problem text not null default '',
  action text not null default '',
  spare_part text not null default '',

  -- Aus dem eigenen Lager entnommenes Ersatzteil. Ist das gesetzt, steht im
  -- Journal eine VERBRAUCH-Buchung dazu: Das Display aus dem Spendergerät
  -- verschwindet nicht still, sondern verlässt den Bestand nachvollziehbar.
  part_article_id uuid references public.articles (id) on delete set null,
  part_quantity integer not null default 0 check (part_quantity >= 0),
  part_cost_cents integer not null default 0 check (part_cost_cents >= 0),

  labor_minutes integer not null default 0 check (labor_minutes >= 0),
  status repair_status not null default 'OFFEN',
  created_at timestamptz not null default now()
);

create index repairs_unit_id_idx on public.repairs (unit_id);
create index repairs_part_article_id_idx on public.repairs (part_article_id);

/* ------------------------------------------------------------------ */
/* Bilder                                                              */
/* ------------------------------------------------------------------ */

-- Ein Bild hängt entweder am Artikel (Mengenware) oder am Gerät. Genau
-- eines von beidem — sonst wäre nicht entscheidbar, welches Bild ein
-- Inserat trägt.
create table public.stock_images (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles (id) on delete cascade,
  unit_id uuid references public.article_units (id) on delete cascade,
  url text not null,
  storage_path text,
  name text not null default '',
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint stock_images_one_owner check (
    (article_id is not null) <> (unit_id is not null)
  )
);

create index stock_images_article_idx on public.stock_images (article_id, sort_order);
create index stock_images_unit_idx on public.stock_images (unit_id, sort_order);

-- Höchstens ein Titelbild je Träger — sonst entscheidet die Sortierung
-- zufällig, welches Bild im Kanal landet.
create unique index stock_images_one_primary_article
  on public.stock_images (article_id) where is_primary and article_id is not null;
create unique index stock_images_one_primary_unit
  on public.stock_images (unit_id) where is_primary and unit_id is not null;

/* ------------------------------------------------------------------ */
/* Inserate                                                            */
/* ------------------------------------------------------------------ */

-- Wie bei den Bildern: entweder Artikel oder Gerät. Ein Artikel kann auf
-- mehreren Kanälen stehen — der Primärschlüssel enthält deshalb den Kanal.
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles (id) on delete cascade,
  unit_id uuid references public.article_units (id) on delete cascade,
  channel channel not null,
  status listing_status not null default 'NICHT_VEROEFFENTLICHT',
  external_ids jsonb not null default '{}'::jsonb,
  external_url text,
  price_cents integer check (price_cents >= 0),
  inventory integer not null default 0 check (inventory >= 0),
  last_synced_at timestamptz,
  -- Bei status = 'FEHLER' gefüllt. Fehler werden nie still verschluckt.
  last_error text,
  retry_count integer not null default 0 check (retry_count >= 0),
  updated_at timestamptz not null default now(),

  constraint listings_one_owner check (
    (article_id is not null) <> (unit_id is not null)
  )
);

create unique index listings_article_channel_key
  on public.listings (article_id, channel) where article_id is not null;
create unique index listings_unit_channel_key
  on public.listings (unit_id, channel) where unit_id is not null;

create index listings_error_idx on public.listings (status) where status = 'FEHLER';

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Ausschlachtung                                                      */
/* ------------------------------------------------------------------ */

-- Der wichtigste Vorgang des Teilelagers: Ohne ihn verschwindet ein
-- zerlegtes Gerät still aus dem Bestand und die Teile tauchen ohne
-- Einstandswert auf — jede spätere Marge wäre erfunden.
create table public.teardowns (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null default '',

  source_unit_id uuid references public.article_units (id) on delete set null,
  source_article_id uuid references public.articles (id) on delete set null,
  -- Kopien, damit der Vorgang auch nach Archivierung lesbar bleibt.
  source_label text not null default '',
  source_number text not null default '',

  source_value_cents integer not null default 0 check (source_value_cents >= 0),
  distribution teardown_distribution not null default 'GLEICH',
  -- Nicht zugeordneter Rest (Schrott, Rundung). Wird ausgewiesen statt
  -- stillschweigend auf die Teile verteilt.
  scrap_value_cents integer not null default 0 check (scrap_value_cents >= 0),

  status teardown_status not null default 'ENTWURF',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index teardowns_source_unit_idx on public.teardowns (source_unit_id);
create index teardowns_at_idx on public.teardowns (at desc);

alter table public.article_units
  add constraint article_units_teardown_id_fkey
  foreign key (teardown_id) references public.teardowns (id) on delete set null;

create table public.teardown_lines (
  id uuid primary key default gen_random_uuid(),
  teardown_id uuid not null references public.teardowns (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  -- Nur Gewichtung für die Verteilung NACH_WERT, ausdrücklich keine
  -- Preiszusage.
  market_value_cents integer check (market_value_cents >= 0),
  -- Ergebnis der Verteilung: Einstandswert je Stück.
  value_share_cents integer not null default 0 check (value_share_cents >= 0),
  location_id uuid references public.storage_locations (id) on delete set null,
  note text not null default '',
  sort_order integer not null default 0
);

create index teardown_lines_teardown_idx on public.teardown_lines (teardown_id, sort_order);

/* ------------------------------------------------------------------ */
/* Bewegungsjournal                                                    */
/* ------------------------------------------------------------------ */

-- Der Bestand ist kein Feld, sondern die Summe dieser Buchungen. Ein von
-- Hand überschreibbarer Zähler läuft in der Praxis auseinander — und dann
-- ist die Übersicht so wertlos wie die Excel-Liste, die sie ersetzt.
--
-- Die Zeilen werden nicht geändert und nicht gelöscht: Eine Rücknahme ist
-- eine Gegenbuchung. Deshalb kein updated_at und keine UPDATE-Policy.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null default '',

  article_id uuid not null references public.articles (id) on delete restrict,
  unit_id uuid references public.article_units (id) on delete set null,

  -- Vorzeichenbehaftet: positiv = Zugang, negativ = Abgang. Null wäre eine
  -- Buchung ohne Wirkung und damit nur Rauschen im Journal.
  quantity integer not null check (quantity <> 0),
  type movement_type not null,

  -- Einstandswert je Stück, nur bei Zugängen gesetzt. Null heißt: Diese
  -- Menge übernimmt den bisherigen Durchschnitt — nicht: sie ist wertlos.
  unit_cost_cents integer check (unit_cost_cents >= 0),

  location_id uuid references public.storage_locations (id) on delete set null,
  to_location_id uuid references public.storage_locations (id) on delete set null,

  -- Verweis auf den auslösenden Vorgang (Verkauf, Ausschlachtung, Reparatur).
  reference_id uuid,
  note text not null default '',

  -- Eine Umlagerung braucht ein Ziel, alles andere hat keines.
  constraint stock_movements_transfer_target check (
    (type = 'UMLAGERUNG') = (to_location_id is not null)
  )
);

create index stock_movements_article_at_idx on public.stock_movements (article_id, at);
create index stock_movements_unit_idx on public.stock_movements (unit_id);
create index stock_movements_at_idx on public.stock_movements (at desc);
create index stock_movements_reference_idx on public.stock_movements (reference_id);

/* ------------------------------------------------------------------ */
/* Freigabeliste                                                       */
/* ------------------------------------------------------------------ */

-- Fertig vorbereitete Inserate. Das System baut sie selbst; hier bleibt die
-- Entscheidung. Der Inhalt wird mitgespeichert, damit nachvollziehbar ist,
-- was freigegeben wurde — und nicht, was heute daraus geworden wäre.
create table public.publication_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  article_id uuid not null references public.articles (id) on delete cascade,
  unit_id uuid references public.article_units (id) on delete cascade,
  channel channel not null,

  title text not null default '',
  description text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  quantity integer not null default 1 check (quantity >= 0),
  image_urls jsonb not null default '[]'::jsonb,
  attribute_lines jsonb not null default '[]'::jsonb,

  status proposal_status not null default 'OFFEN',
  decided_at timestamptz,
  decided_by text,
  note text not null default ''
);

create index publication_proposals_status_idx on public.publication_proposals (status);

-- Höchstens ein offener Vorschlag je Ziel und Kanal: Zwei Vorschläge für
-- dasselbe Inserat lassen den Bediener zweimal dasselbe entscheiden.
create unique index publication_proposals_open_unit_key
  on public.publication_proposals (unit_id, channel)
  where status = 'OFFEN' and unit_id is not null;
create unique index publication_proposals_open_article_key
  on public.publication_proposals (article_id, channel)
  where status = 'OFFEN' and unit_id is null;

/* ------------------------------------------------------------------ */
/* Verkauf                                                             */
/* ------------------------------------------------------------------ */

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles (id) on delete set null,
  -- Null bei Mengenartikeln — dort wird kein Einzelstück verkauft.
  unit_id uuid references public.article_units (id) on delete set null,

  -- Kopien, damit die Verkaufsliste auch nach Archivierung lesbar bleibt.
  item_number text not null,
  item_label text not null default '',
  serial_number text not null default '',
  category_label text not null default '',

  quantity integer not null default 1 check (quantity > 0),
  channel sale_channel not null,
  customer_source customer_source not null default 'UNBEKANNT',
  customer_region text not null default '',
  sale_location text not null default '',

  sale_price_cents integer not null check (sale_price_cents >= 0),
  purchase_price_cents integer not null default 0 check (purchase_price_cents >= 0),
  repair_costs_cents integer not null default 0 check (repair_costs_cents >= 0),
  additional_costs_cents integer not null default 0 check (additional_costs_cents >= 0),

  sold_at timestamptz not null,
  note text not null default '',

  -- Ein stornierter Verkauf bleibt stehen. Ein gelöschter wäre ein Loch in
  -- der Umsatzreihe, das sich später niemand erklären kann.
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  cancel_restocked boolean not null default false,

  sheets_sync_status sync_status not null default 'NICHT_ERFORDERLICH',
  sheets_synced_at timestamptz,
  sheets_error text,
  -- Belegte Zeile in der Umsatztabelle: Ein Wiederholungsversuch
  -- aktualisiert dieselbe Zeile, statt eine zweite anzulegen.
  sheets_row_number integer,

  created_at timestamptz not null default now(),

  -- Storniert ohne Grund ist nicht nachvollziehbar.
  constraint sales_cancel_reason check (
    cancelled_at is null or cancel_reason <> ''
  )
);

create index sales_article_id_idx on public.sales (article_id);
create index sales_unit_id_idx on public.sales (unit_id);
create index sales_sold_at_idx on public.sales (sold_at desc);
create index sales_open_idx on public.sales (sold_at desc) where cancelled_at is null;
create index sales_sheets_sync_status_idx on public.sales (sheets_sync_status)
  where sheets_sync_status in ('WARTET', 'FEHLER');

/* ------------------------------------------------------------------ */
/* Protokoll                                                           */
/* ------------------------------------------------------------------ */

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null default '',
  category audit_category not null,
  action text not null,
  detail text not null default '',
  article_id uuid references public.articles (id) on delete set null,
  unit_id uuid references public.article_units (id) on delete set null,
  -- Sichtbare Nummer des betroffenen Objekts, als Kopie: Der Eintrag soll
  -- auch dann lesbar bleiben, wenn der Datensatz fort ist.
  item_number text,
  level audit_level not null default 'info'
);

create index audit_events_at_idx on public.audit_events (at desc);
create index audit_events_article_idx on public.audit_events (article_id, at desc);
create index audit_events_unit_idx on public.audit_events (unit_id, at desc);

/* ------------------------------------------------------------------ */
/* Row Level Security                                                  */
/* ------------------------------------------------------------------ */

-- SKOPE ist ein internes Werkzeug: Jeder angemeldete Mitarbeiter sieht den
-- gesamten Bestand. Nicht angemeldete Zugriffe (anon) erhalten nichts.
alter table public.categories                   enable row level security;
alter table public.storage_locations            enable row level security;
alter table public.articles                     enable row level security;
alter table public.article_units                enable row level security;
alter table public.inspection_check_definitions enable row level security;
alter table public.inspection_checks            enable row level security;
alter table public.repairs                      enable row level security;
alter table public.stock_images                 enable row level security;
alter table public.listings                     enable row level security;
alter table public.teardowns                    enable row level security;
alter table public.teardown_lines               enable row level security;
alter table public.stock_movements              enable row level security;
alter table public.publication_proposals        enable row level security;
alter table public.sales                        enable row level security;
alter table public.audit_events                 enable row level security;
alter table public.import_batches               enable row level security;
alter table public.import_issues                enable row level security;
alter table public.import_column_mappings       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'storage_locations', 'articles', 'article_units',
    'inspection_check_definitions', 'inspection_checks', 'repairs',
    'stock_images', 'listings', 'teardowns', 'teardown_lines',
    'publication_proposals', 'sales', 'import_batches', 'import_issues',
    'import_column_mappings'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end;
$$;

-- Journal und Protokoll sind schreib- und lesbar, aber nicht änderbar: Ein
-- nachträglich korrigierbares Journal ist keins. Eine Fehlbuchung wird
-- gegengebucht, nicht überschrieben.
create policy stock_movements_read on public.stock_movements
  for select to authenticated using (true);

create policy stock_movements_insert on public.stock_movements
  for insert to authenticated with check (true);

create policy audit_events_read on public.audit_events
  for select to authenticated using (true);

create policy audit_events_insert on public.audit_events
  for insert to authenticated with check (true);
