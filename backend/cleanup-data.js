const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupData() {
  try {
    console.log('Starting data cleanup...');

    // Delete in correct order to respect foreign key constraints
    const tables = [
      'volunteer_shifts',
      'volunteers', 
      'players',
      'families'
    ];

    for (const table of tables) {
      console.log(`Clearing ${table}...`);
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
      
      if (error) {
        console.error(`Error clearing ${table}:`, error.message);
      } else {
        console.log(`✓ Cleared ${table}`);
      }
    }

    console.log('Data cleanup completed!');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

cleanupData();