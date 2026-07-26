ALTER TABLE public.profile_spec_items
  DROP CONSTRAINT IF EXISTS profile_spec_items_item_type_check;

ALTER TABLE public.profile_spec_items
  ADD CONSTRAINT profile_spec_items_item_type_check
  CHECK (
    item_type IN (
      'experience',
      'award',
      'certification',
      'activity',
      'project',
      'language',
      'education'
    )
  );
