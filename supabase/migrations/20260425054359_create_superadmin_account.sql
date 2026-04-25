/*
  # Create Superadmin Account

  Creates the system owner (super_admin) account.

  Email:    remowangai@gmail.com
  Password: 12345678M
  Role:     super_admin
  Approval: approved

  No school_id — superadmin is platform-level, not school-scoped.
*/

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Create auth user if it does not exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'remowangai@gmail.com') THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'remowangai@gmail.com',
      crypt('12345678M', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"System Owner"}',
      now(),
      now(),
      'authenticated',
      'authenticated'
    );
  ELSE
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'remowangai@gmail.com';
    -- Update password to ensure it matches
    UPDATE auth.users
    SET encrypted_password = crypt('12345678M', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Upsert the profile
  INSERT INTO profiles (id, name, role, approval_status, school_id)
  VALUES (v_user_id, 'System Owner', 'super_admin', 'approved', NULL)
  ON CONFLICT (id) DO UPDATE SET
    name = 'System Owner',
    role = 'super_admin',
    approval_status = 'approved',
    school_id = NULL;

END $$;
