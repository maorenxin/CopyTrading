import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY 环境变量");
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return client;
}
