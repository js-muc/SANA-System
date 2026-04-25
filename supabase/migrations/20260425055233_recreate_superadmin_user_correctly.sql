/*
  # Recreate SuperAdmin Auth User Correctly

  The previous superadmin auth.users row was missing required GoTrue fields
  (is_anonymous, empty-string token fields) causing a 500 "Database error querying schema"
  on login. This migration deletes and recreates the row with all required fields set.

  Credentials:
    email:    remowangai@gmail.com
    password: 12345678M
*/

DO $$
DECLARE
  v_user_id uuid := 'ad4956a2-07a2-430e-8006-65c4c1df0f3e';
BEGIN
  -- Remove old broken row (profile FK must go first)
  DELETE FROM public.profiles WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;

  -- Insert correctly with ALL required GoTrue fields
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'remowangai@gmail.com',
    crypt('12345678M', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    false,
    false,
    now(),
    now()
  );

  -- Recreate the profile
  INSERT INTO public.profiles (id, name, role, approval_status, school_id)
  VALUES (v_user_id, 'System Owner', 'super_admin', 'approved', NULL);

END $$;
