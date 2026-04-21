/*
  # Allow Public Read of Schools for Signup Dropdown

  ## Summary
  Teachers signing up need to see the list of available schools before
  they are authenticated. This migration adds a SELECT policy that allows
  any authenticated user to read school names for the signup flow.

  This is safe because school names are not sensitive — they are the
  public-facing identity of the institution.
*/

CREATE POLICY "Authenticated users can read schools"
  ON schools FOR SELECT
  TO authenticated
  USING (true);
