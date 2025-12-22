# Environment Variables Template

Copy this to `.env` file in your project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Google Sheets Credentials (for serverless functions)
# Store the entire JSON as a single-line string
GOOGLE_SHEETS_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}

# Optional: ETL Base URL (if using external server)
VITE_ETL_BASE_URL=http://localhost:8787
```

## Vercel Environment Variables

In Vercel Dashboard, add these environment variables:
1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`
3. `GOOGLE_SHEETS_CREDENTIALS_JSON` (minified JSON, no newlines)
