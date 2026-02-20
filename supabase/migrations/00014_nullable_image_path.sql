-- Allow image_path to be NULL after storage cleanup for published pins
ALTER TABLE pins ALTER COLUMN image_path DROP NOT NULL;
