/**
 * Script to create the friends table in Supabase
 * Run this script to fix the "Could not find a relationship between 'friends' and 'user_id_1'" error
 */

const { getSupabaseClient } = require('./supabase-client');
const fs = require('fs');
const path = require('path');

async function createFriendsTable() {
  try {
    console.log('Starting friends table creation process...');
    
    // Get the service client to bypass RLS
    const supabase = getSupabaseClient(true);
    
    // Read the SQL for creating the friends table from update-schema.sql
    const schemaPath = path.join(__dirname, 'update-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Extract just the friends table creation SQL
    const friendsTableRegex = /-- Create the new friends table\s+(CREATE TABLE friends[\s\S]+?;)\s+-- Optional: Indexes[\s\S]+?(CREATE INDEX[\s\S]+?;[\s\S]+?;)/;
    const match = schemaSql.match(friendsTableRegex);
    
    if (!match) {
      console.error('Could not find friends table SQL in update-schema.sql');
      return;
    }
    
    const tableCreationSql = match[1];
    const indexCreationSql = match[2];
    
    // Execute the SQL to create the friends table
    console.log('Creating friends table...');
    const { error: tableError } = await supabase.rpc('exec_sql', { sql: tableCreationSql });
    
    if (tableError) {
      console.error('Error creating friends table:', tableError);
      
      // If the table already exists, try to alter it to add the constraints
      if (tableError.message.includes('already exists')) {
        console.log('Friends table already exists, checking for missing constraints...');
        
        // Check if constraints exist
        const { data: constraints, error: constraintError } = await supabase.rpc('exec_sql', { 
          sql: "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'friends' AND constraint_type = 'FOREIGN KEY';" 
        });
        
        if (constraintError) {
          console.error('Error checking constraints:', constraintError);
          return;
        }
        
        // If constraints don't exist, add them
        if (!constraints || constraints.length < 2) {
          console.log('Adding missing foreign key constraints to friends table...');
          const alterTableSql = `
            ALTER TABLE friends 
            ADD CONSTRAINT fk_user_1 FOREIGN KEY (user_id_1) REFERENCES users(id) ON DELETE CASCADE,
            ADD CONSTRAINT fk_user_2 FOREIGN KEY (user_id_2) REFERENCES users(id) ON DELETE CASCADE;
          `;
          
          const { error: alterError } = await supabase.rpc('exec_sql', { sql: alterTableSql });
          
          if (alterError) {
            console.error('Error adding constraints to friends table:', alterError);
            return;
          }
          
          console.log('Successfully added foreign key constraints to friends table');
        } else {
          console.log('Foreign key constraints already exist on friends table');
        }
      } else {
        return;
      }
    } else {
      console.log('Friends table created successfully');
      
      // Create indexes
      console.log('Creating indexes...');
      const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexCreationSql });
      
      if (indexError) {
        console.error('Error creating indexes:', indexError);
        return;
      }
      
      console.log('Indexes created successfully');
    }
    
    console.log('Friends table setup completed successfully');
  } catch (error) {
    console.error('Unexpected error creating friends table:', error);
  }
}

// Run the function
createFriendsTable()
  .then(() => console.log('Script completed'))
  .catch(err => console.error('Script failed:', err));
