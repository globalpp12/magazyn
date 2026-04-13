import { createClient } from "@supabase/supabase-js";
import config from "../config";

if (!config.supabaseUrl) {
  console.warn("Brak VITE_SUPABASE_URL");
}

if (!config.supabaseAnonKey) {
  console.warn("Brak VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);