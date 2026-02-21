import { createConnection } from "../../config/createDB";

async function addCategoryOrderColumns() {
  const connection = await createConnection();
  
  try {
    console.log("Adding subcategory_order and detailcategory_order columns to hoBIT-backend...");
    
    // Add columns
    await connection.query(`
      ALTER TABLE hobit.senior_faqs 
      ADD COLUMN IF NOT EXISTS subcategory_order INT DEFAULT 1 AFTER category_order,
      ADD COLUMN IF NOT EXISTS detailcategory_order INT DEFAULT 1 AFTER subcategory_order
    `);
    
    console.log("Columns added successfully!");
    
    // Update existing records with default order values
    console.log("Setting default order values for existing records...");
    
    await connection.query(`
      UPDATE hobit.senior_faqs 
      SET subcategory_order = 1 
      WHERE subcategory_order IS NULL
    `);
    
    await connection.query(`
      UPDATE hobit.senior_faqs 
      SET detailcategory_order = 1 
      WHERE detailcategory_order IS NULL
    `);
    
    console.log("Migration completed successfully!");
    
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run migration
addCategoryOrderColumns()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
