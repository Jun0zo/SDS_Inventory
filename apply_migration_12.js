#!/usr/bin/env node
/**
 * Apply migration 12: Fix material capacity MV unique index
 * This fixes the 500 error when updating expected materials.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

async function main() {
  // Get Supabase credentials
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Error: Missing Supabase credentials in .env file');
    console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  // Create Supabase client with service role
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Read migration SQL
  const migrationFile = path.join(__dirname, 'supabase/migration/12_fix_material_capacity_unique_index.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Executing migration 12...');
  console.log('Project:', supabaseUrl.replace('https://', '').split('.')[0]);

  try {
    // Split into individual SQL statements and execute them
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.match(/^\/\*/));

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      console.log(`\nExecuting statement ${i + 1}/${statements.length}...`);

      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: stmt + ';'
      });

      if (error) {
        // If exec_sql function doesn't exist, provide alternative instructions
        if (error.message && error.message.includes('could not find function')) {
          console.log('\nThe exec_sql function is not available in your database.');
          console.log('\nPlease execute the migration manually using one of these methods:\n');
          console.log('1. Supabase Dashboard SQL Editor:');
          console.log(`   - Go to: ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/sql`);
          console.log('   - Copy and paste the contents of: supabase/migration/12_fix_material_capacity_unique_index.sql');
          console.log('   - Click "Run"\n');
          console.log('2. Use the SQL directly (copy from the file above)');
          process.exit(1);
        }
        throw error;
      }
    }

    console.log('\n✓ Migration executed successfully!');
    console.log('The 500 error should now be fixed.');
    console.log('\nYou can now update expected materials without errors.');

  } catch (error) {
    console.error('\n✗ Error executing migration:', error.message);
    console.log('\nPlease execute manually via Supabase Dashboard SQL Editor:');
    console.log(`https://supabase.com/dashboard/project/${supabaseUrl.replace('https://', '').split('.')[0]}/sql`);
    process.exit(1);
  }
}

main();
