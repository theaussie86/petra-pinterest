-- Migration: On-demand profile creation for missing profiles
-- Purpose: Handles users who signed up before the auto-profile trigger was created
-- Security: SECURITY DEFINER allows profile creation bypassing RLS

CREATE OR REPLACE FUNCTION public.ensure_profile_exists()
RETURNS TABLE(tenant_id UUID) AS $$
DECLARE
  _tenant_id UUID;
BEGIN
  -- Try to get existing profile
  SELECT p.tenant_id INTO _tenant_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  -- If found, return it
  IF FOUND THEN
    RETURN QUERY SELECT _tenant_id;
    RETURN;
  END IF;

  -- Profile missing, create it
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    auth.uid(),
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()),
      (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = auth.uid()),
      split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;

  -- Return the tenant_id (either just created or from race condition winner)
  SELECT p.tenant_id INTO _tenant_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN QUERY SELECT _tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
