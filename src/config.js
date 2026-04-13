const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  uploadWorkerUrl: import.meta.env.VITE_UPLOAD_WORKER_URL || "",
  r2PublicBaseUrl: import.meta.env.VITE_R2_PUBLIC_BASE_URL || "",
};

export default config;