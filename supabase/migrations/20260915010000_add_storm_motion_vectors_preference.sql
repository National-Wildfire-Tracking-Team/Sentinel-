-- Radar Settings: "Storm Motion Vectors" toggle, added to display_preferences
-- alongside the other per-user map display prefs (popup_spotlight, etc.).
alter table public.display_preferences
  add column if not exists storm_motion_vectors boolean not null default false;
