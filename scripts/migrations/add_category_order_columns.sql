-- Add subcategory_order and detailcategory_order columns to senior_faqs table
-- Run this migration manually or using your preferred migration tool
-- Note: If columns already exist, this will produce an error but won't affect the table

ALTER TABLE hobit.senior_faqs 
ADD COLUMN subcategory_order INT DEFAULT 1 AFTER category_order;

ALTER TABLE hobit.senior_faqs 
ADD COLUMN detailcategory_order INT DEFAULT 1 AFTER subcategory_order;

-- Update existing records with default order values if needed
UPDATE hobit.senior_faqs 
SET subcategory_order = 1 
WHERE subcategory_order IS NULL;

UPDATE hobit.senior_faqs 
SET detailcategory_order = 1 
WHERE detailcategory_order IS NULL;
