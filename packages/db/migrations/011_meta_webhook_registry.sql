CREATE TABLE meta_whatsapp_phone_mappings (
  phone_number_id text PRIMARY KEY CHECK (phone_number_id ~ '^[0-9]{1,32}$'),
  waba_id text NOT NULL CHECK (waba_id ~ '^[0-9]{1,32}$'),
  organization_id text NOT NULL REFERENCES organizations,
  enabled boolean NOT NULL DEFAULT false,
  authority_reference text,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, verified_by) REFERENCES members(organization_id,id),
  CHECK (NOT enabled OR (authority_reference IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
