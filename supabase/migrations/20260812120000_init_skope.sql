-- SKOPE Warensystem — Initiales Schema
--
-- Bildet lib/domain/types.ts 1:1 in Postgres ab. Geldbeträge liegen
-- durchgängig als ganze Cent (integer) vor, nie als Fließkommazahl.
-- Alle Bezeichner sind lowercase snake_case; die TypeScript-Schicht
-- mappt camelCase auf diese Spalten.

/* ------------------------------------------------------------------ */
/* Enums — spiegeln die Unions aus dem Domain-Modell                    */
/* ------------------------------------------------------------------ */

create type workflow_status as enum (
  'EINGEGANGEN', 'IN_PRUEFUNG', 'AUFBEREITUNG', 'VERKAUFSBEREIT', 'ARCHIVIERT'
);

create type sale_status as enum ('VERFUEGBAR', 'RESERVIERT', 'VERKAUFT');

create type listing_status as enum (
  'NICHT_VEROEFFENTLICHT', 'VEROEFFENTLICHT', 'SYNC_AUSSTEHEND', 'FEHLER', 'DEAKTIVIERT'
);

create type channel as enum ('SHOPIFY', 'KLEINANZEIGEN');

create type sale_channel as enum (
  'SHOPIFY', 'KLEINANZEIGEN', 'VOR_ORT', 'TELEFON', 'SONSTIGE'
);

create type customer_source as enum (
  'UNBEKANNT', 'WEBSITE', 'GOOGLE', 'KLEINANZEIGEN', 'SOCIAL_MEDIA',
  'EMPFEHLUNG', 'STAMMKUNDE', 'LAUFKUNDSCHAFT', 'SONSTIGE'
);

create type inspection_result as enum ('NICHT_GEPRUEFT', 'BESTANDEN', 'PROBLEM');

create type repair_status as enum ('OFFEN', 'IN_ARBEIT', 'ERLEDIGT');

create type condition as enum ('WIE_NEU', 'SEHR_GUT', 'GUT', 'GEBRAUCHT', 'DEFEKT');

create type sync_status as enum (
  'NICHT_ERFORDERLICH', 'WARTET', 'SYNCHRONISIERT', 'FEHLER'
);

create type audit_category as enum (
  'SCOOTER', 'PRUEFUNG', 'AUFBEREITUNG', 'BILDER', 'KANAL',
  'VERKAUF', 'SYNC', 'IMPORT', 'SYSTEM'
);

create type audit_level as enum ('info', 'success', 'warning', 'error');

create type app_role as enum ('admin', 'employee');

create type import_source as enum ('AVIDES_DEMO', 'DATEI');

create type issue_severity as enum ('warning', 'error');

create type inspection_group as enum ('Mechanik', 'Elektrik', 'Fahrbetrieb', 'Dokumente');

/* ------------------------------------------------------------------ */
/* Hilfsfunktion: updated_at automatisch fortschreiben                  */
/* ------------------------------------------------------------------ */

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/* ------------------------------------------------------------------ */
/* Benutzer                                                            */
/* ------------------------------------------------------------------ */

-- Ergänzt auth.users um Rolle und Anzeigename. Ohne diesen Datensatz
-- ist ein angemeldeter Benutzer zwar authentifiziert, aber im Fachmodell
-- nicht bekannt.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  initials text not null,
  role app_role not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Scooter                                                             */
/* ------------------------------------------------------------------ */

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source import_source not null,
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
  serial_number text not null default '',
  reason text not null,
  severity issue_severity not null
);

create index import_issues_batch_id_idx on public.import_issues (batch_id);

create table public.scooters (
  id uuid primary key default gen_random_uuid(),

  -- Sichtbare Nummer, dient zugleich als SKU.
  scooter_number text not null unique,
  serial_number text not null,

  manufacturer text not null default '',
  model text not null default '',
  variant text not null default '',
  color text not null default '',
  mileage_km integer not null default 0 check (mileage_km >= 0),
  condition condition not null default 'GUT',
  description text not null default '',
  -- Liste aus { key, value } — Freitext, deshalb bewusst als jsonb.
  technical_data jsonb not null default '[]'::jsonb,

  purchase_price_cents integer not null default 0 check (purchase_price_cents >= 0),
  additional_costs_cents integer not null default 0 check (additional_costs_cents >= 0),
  sale_price_cents integer check (sale_price_cents >= 0),

  purchase_date date,
  arrival_date date,

  location text not null default '',
  notes text not null default '',

  workflow_status workflow_status not null default 'EINGEGANGEN',
  status_sale sale_status not null default 'VERFUEGBAR',

  -- Dokumentenlage
  doc_abe boolean not null default false,
  doc_invoice boolean not null default false,
  doc_other boolean not null default false,
  doc_note text not null default '',

  -- Prüfung (die einzelnen Prüfpunkte stehen in inspection_checks)
  inspection_completed_at timestamptz,
  inspection_completed_by text,
  inspection_note text not null default '',

  -- Aufbereitung
  cleaning_done boolean not null default false,
  cleaning_done_at timestamptz,
  cleaning_note text not null default '',

  import_batch_id uuid references public.import_batches (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seriennummern sind nur dort eindeutig, wo sie gepflegt sind: der Import
-- überspringt Dubletten anhand dieser Einschränkung, leere Angaben blockieren
-- aber keinen zweiten Datensatz.
create unique index scooters_serial_number_key
  on public.scooters (serial_number)
  where serial_number <> '';

create index scooters_workflow_status_idx on public.scooters (workflow_status);
create index scooters_sale_status_idx on public.scooters (status_sale);
create index scooters_import_batch_id_idx on public.scooters (import_batch_id);
create index scooters_created_at_idx on public.scooters (created_at desc);

create trigger scooters_set_updated_at
  before update on public.scooters
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Prüfung                                                             */
/* ------------------------------------------------------------------ */

-- Prüfpunkte als Daten, nicht als Spalten: ein neuer Punkt ist damit eine
-- Konfigurationsänderung und keine Migration.
create table public.inspection_check_definitions (
  key text primary key,
  label text not null,
  critical boolean not null default false,
  check_group inspection_group not null,
  sort_order integer not null default 0
);

create table public.inspection_checks (
  scooter_id uuid not null references public.scooters (id) on delete cascade,
  check_key text not null references public.inspection_check_definitions (key) on delete cascade,
  result inspection_result not null default 'NICHT_GEPRUEFT',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (scooter_id, check_key)
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
  scooter_id uuid not null references public.scooters (id) on delete cascade,
  problem text not null default '',
  action text not null default '',
  spare_part text not null default '',
  part_cost_cents integer not null default 0 check (part_cost_cents >= 0),
  labor_minutes integer not null default 0 check (labor_minutes >= 0),
  status repair_status not null default 'OFFEN',
  created_at timestamptz not null default now()
);

create index repairs_scooter_id_idx on public.repairs (scooter_id);

/* ------------------------------------------------------------------ */
/* Bilder                                                              */
/* ------------------------------------------------------------------ */

create table public.scooter_images (
  id uuid primary key default gen_random_uuid(),
  scooter_id uuid not null references public.scooters (id) on delete cascade,
  -- Öffentliche URL aus Supabase Storage.
  url text not null,
  storage_path text,
  name text not null default '',
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index scooter_images_scooter_id_idx on public.scooter_images (scooter_id, sort_order);

-- Höchstens ein Titelbild je Scooter — sonst entscheidet die Sortierung
-- zufällig, welches Bild im Kanal landet.
create unique index scooter_images_one_primary
  on public.scooter_images (scooter_id)
  where is_primary;

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

create table public.listings (
  scooter_id uuid not null references public.scooters (id) on delete cascade,
  channel channel not null,
  status listing_status not null default 'NICHT_VEROEFFENTLICHT',
  -- Externe IDs des Kanals, bei Shopify Product/Variant/InventoryItem.
  external_ids jsonb not null default '{}'::jsonb,
  external_url text,
  price_cents integer check (price_cents >= 0),
  inventory integer not null default 0 check (inventory >= 0),
  last_synced_at timestamptz,
  -- Bei status = 'FEHLER' gefüllt. Fehler werden nie still verschluckt.
  last_error text,
  retry_count integer not null default 0 check (retry_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scooter_id, channel)
);

create index listings_status_idx on public.listings (status) where status = 'FEHLER';

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Verkauf                                                             */
/* ------------------------------------------------------------------ */

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  scooter_id uuid references public.scooters (id) on delete set null,

  -- Kopien, damit die Verkaufsliste auch nach Archivierung lesbar bleibt.
  scooter_number text not null,
  model_label text not null default '',
  serial_number text not null default '',

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

  -- Reporting-Sync Richtung Google Sheets.
  sheets_sync_status sync_status not null default 'NICHT_ERFORDERLICH',
  sheets_synced_at timestamptz,
  sheets_error text,
  -- Belegte Zeile in der Umsatztabelle: ein Wiederholungsversuch
  -- aktualisiert dieselbe Zeile, statt eine zweite anzulegen.
  sheets_row_number integer,

  created_at timestamptz not null default now()
);

create index sales_scooter_id_idx on public.sales (scooter_id);
create index sales_sold_at_idx on public.sales (sold_at desc);
create index sales_sheets_sync_status_idx on public.sales (sheets_sync_status)
  where sheets_sync_status in ('WARTET', 'FEHLER');

/* ------------------------------------------------------------------ */
/* Audit Log                                                           */
/* ------------------------------------------------------------------ */

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null default '',
  category audit_category not null,
  action text not null,
  detail text not null default '',
  scooter_id uuid references public.scooters (id) on delete set null,
  scooter_number text,
  level audit_level not null default 'info'
);

create index audit_events_at_idx on public.audit_events (at desc);
create index audit_events_scooter_id_idx on public.audit_events (scooter_id, at desc);

/* ------------------------------------------------------------------ */
/* Einstellungen                                                       */
/* ------------------------------------------------------------------ */

-- Gespeichertes Spalten-Mapping, damit der nächste Import schneller geht.
create table public.import_column_mappings (
  target text primary key,
  source text not null default ''
);

-- Einzeiliger Zustand der Integrationen. Die Prüfung auf id = 1 verhindert,
-- dass versehentlich mehrere konkurrierende Zustände entstehen.
create table public.integration_state (
  id smallint primary key default 1 check (id = 1),
  simulate_shopify_error boolean not null default false,
  simulate_sheets_error boolean not null default false,
  sheets_last_sync_at timestamptz,
  shopify_last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.integration_state (id) values (1);

create trigger integration_state_set_updated_at
  before update on public.integration_state
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Row Level Security                                                  */
/* ------------------------------------------------------------------ */

-- SKOPE ist ein internes Werkzeug: jeder angemeldete Mitarbeiter sieht den
-- gesamten Bestand. Nicht angemeldete Zugriffe (anon) erhalten nichts.
alter table public.profiles                     enable row level security;
alter table public.scooters                     enable row level security;
alter table public.inspection_check_definitions enable row level security;
alter table public.inspection_checks            enable row level security;
alter table public.repairs                      enable row level security;
alter table public.scooter_images               enable row level security;
alter table public.listings                     enable row level security;
alter table public.sales                        enable row level security;
alter table public.audit_events                 enable row level security;
alter table public.import_batches               enable row level security;
alter table public.import_issues                enable row level security;
alter table public.import_column_mappings       enable row level security;
alter table public.integration_state            enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'scooters', 'inspection_check_definitions', 'inspection_checks', 'repairs',
    'scooter_images', 'listings', 'sales', 'import_batches', 'import_issues',
    'import_column_mappings', 'integration_state'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end;
$$;

-- Das Protokoll ist bewusst nur schreib- und lesbar, nicht änderbar:
-- ein nachträglich korrigierbares Protokoll ist keins.
create policy audit_events_read on public.audit_events
  for select to authenticated using (true);

create policy audit_events_insert on public.audit_events
  for insert to authenticated with check (true);

-- Jeder sieht die Stammdaten der Kolleginnen und Kollegen (Kürzel im
-- Protokoll), ändern darf aber nur der eigene Datensatz — die Rolle selbst
-- vergibt ausschließlich der Administrationszugang (service_role).
create policy profiles_read on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

/* ------------------------------------------------------------------ */
/* Grunddaten: Prüfpunkte                                              */
/* ------------------------------------------------------------------ */

-- Identisch mit INSPECTION_CHECKS aus lib/domain/inspection.ts.
insert into public.inspection_check_definitions (key, label, critical, check_group, sort_order)
values
  ('visual',      'Sichtprüfung',  true,  'Mechanik',    10),
  ('brake_front', 'Bremse vorne',  true,  'Mechanik',    20),
  ('brake_rear',  'Bremse hinten', true,  'Mechanik',    30),
  ('tire_front',  'Reifen vorne',  true,  'Mechanik',    40),
  ('tire_rear',   'Reifen hinten', true,  'Mechanik',    50),
  ('lights',      'Beleuchtung',   true,  'Elektrik',    60),
  ('battery',     'Akku',          true,  'Elektrik',    70),
  ('charger',     'Ladegerät',     false, 'Elektrik',    80),
  ('display',     'Display',       false, 'Elektrik',    90),
  ('electronics', 'Elektronik',    true,  'Elektrik',   100),
  ('test_ride',   'Testfahrt',     true,  'Fahrbetrieb', 110),
  ('papers',      'ABE / Papiere', true,  'Dokumente',  120);
