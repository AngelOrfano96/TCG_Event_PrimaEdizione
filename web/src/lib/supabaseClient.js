// web/src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// true se entrambe le env sono presenti
export const envOk = Boolean(url && anon);

// Esporta sempre qualcosa: se env mancano, supabase resta null
export const supabase = envOk
  ? createClient(url, anon, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

