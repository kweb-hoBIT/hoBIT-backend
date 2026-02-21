-- Add subcategory_order column to faqs table
-- Run this migration manually or using your preferred migration tool

ALTER TABLE hobit.faqs 
ADD COLUMN IF NOT EXISTS subcategory_order INT DEFAULT 1 AFTER category_order;

-- Update existing records with default order values if needed
UPDATE hobit.faqs 
SET subcategory_order = 1 
WHERE subcategory_order IS NULL;
