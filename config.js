// From Supabase Dashboard -> Project Settings -> API.
// Safe to commit: this is the public client key, and the policies in schema.sql
// only expose the four thea_ tables. Never put the secret or service_role key
// in here — it bypasses row-level security.
// Blank these out to run in practice mode against browser storage instead.
export const SUPABASE_URL = 'https://bmtesfydhaovnaeopghl.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Cby41xFMZI1VeBRSXfdkSw_bZHAuD-2';
