UPDATE "roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'accounting.read',
    'accounting.write',
    'accounting.post',
    'accounting.close'
  ]::TEXT[]) AS permission
)
WHERE "key" = 'FINANCE';
