/**
 * Client-side Materialized Views Verification Script
 *
 * Purpose: Test REST API access to all materialized views
 * Usage: npm run verify-mvs (or ts-node scripts/verify-mvs.ts)
 *
 * This script verifies:
 * 1. All 10 MVs are accessible via Supabase REST API
 * 2. Data can be queried from each MV
 * 3. Permissions are correctly configured
 */

import { supabase } from '../src/lib/supabase/client';

interface VerificationResult {
  mvName: string;
  status: 'success' | 'error';
  rowCount?: number;
  error?: string;
  sampleData?: any;
}

const MV_NAMES = [
  'zone_capacities_mv',
  'dashboard_inventory_stats_mv',
  'inventory_discrepancies_mv',
  'wms_inventory_indexed_mv',
  'sap_inventory_indexed_mv',
  'location_inventory_summary_mv',
  'item_inventory_summary_mv',
  'stock_status_distribution_mv',
  'expiring_items_mv',
  'slow_moving_items_mv',
];

async function verifyMaterializedView(
  mvName: string,
  warehouseCode: string = 'EA2-F'
): Promise<VerificationResult> {
  try {
    console.log(`\n📊 Testing ${mvName}...`);

    // Query the MV
    const query = supabase.from(mvName).select('*', { count: 'exact', head: false });

    // Add warehouse filter if the MV has warehouse_code column
    if (!mvName.includes('indexed')) {
      query.eq('warehouse_code', warehouseCode);
    } else {
      query.eq('warehouse_code', warehouseCode);
    }

    const { data, error, count } = await query.limit(1);

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
      return {
        mvName,
        status: 'error',
        error: error.message,
      };
    }

    console.log(`   ✅ Success: ${count || 0} total rows`);
    if (data && data.length > 0) {
      console.log(`   📄 Sample data:`, JSON.stringify(data[0], null, 2).substring(0, 200) + '...');
    }

    return {
      mvName,
      status: 'success',
      rowCount: count || 0,
      sampleData: data?.[0],
    };
  } catch (err: any) {
    console.error(`   ❌ Exception: ${err.message}`);
    return {
      mvName,
      status: 'error',
      error: err.message,
    };
  }
}

async function testRefreshFunction(): Promise<void> {
  console.log('\n🔄 Testing refresh_all_materialized_views() function...');

  try {
    const { data, error } = await supabase.rpc('refresh_all_materialized_views');

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
      return;
    }

    console.log(`   ✅ Refresh completed successfully`);
    console.log(`   📊 Results:`, JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error(`   ❌ Exception: ${err.message}`);
  }
}

async function testLocationInventoryFunction(): Promise<void> {
  console.log('\n🏗️  Testing get_rack_inventory_summary() function...');

  try {
    const { data, error } = await supabase.rpc('get_rack_inventory_summary', {
      p_warehouse_code: 'EA2-F',
      p_base_location: 'A35',
    });

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
      return;
    }

    console.log(`   ✅ Function executed successfully`);
    console.log(`   📦 Found ${data?.length || 0} locations matching pattern`);
    if (data && data.length > 0) {
      console.log(`   📄 Sample:`, JSON.stringify(data[0], null, 2).substring(0, 200) + '...');
    }
  } catch (err: any) {
    console.error(`   ❌ Exception: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 Starting Materialized Views Verification\n');
  console.log('=' .repeat(60));

  const results: VerificationResult[] = [];

  // Test each materialized view
  for (const mvName of MV_NAMES) {
    const result = await verifyMaterializedView(mvName);
    results.push(result);
  }

  // Test functions
  await testRefreshFunction();
  await testLocationInventoryFunction();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 VERIFICATION SUMMARY\n');

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  console.log(`✅ Successful: ${successCount} / ${MV_NAMES.length}`);
  console.log(`❌ Failed: ${errorCount} / ${MV_NAMES.length}\n`);

  if (errorCount > 0) {
    console.log('❌ Failed MVs:');
    results
      .filter((r) => r.status === 'error')
      .forEach((r) => {
        console.log(`   - ${r.mvName}: ${r.error}`);
      });

    console.log('\n📖 Troubleshooting:');
    console.log('   1. Check if SQL files have been executed in Supabase Dashboard');
    console.log('   2. Run verify_mvs.sql in Supabase SQL Editor');
    console.log('   3. Check TROUBLESHOOTING.md for detailed steps');
    console.log('   4. If MVs exist but still 404, try restarting Supabase API');

    process.exit(1);
  } else {
    console.log('🎉 All materialized views are accessible and working!');
    console.log('\n✨ Next steps:');
    console.log('   - Dashboard should now load significantly faster');
    console.log('   - Zone Layout Editor should have instant location lookups');
    console.log('   - Run "Sync All" to refresh MVs after data changes');

    process.exit(0);
  }
}

// Run the verification
main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
