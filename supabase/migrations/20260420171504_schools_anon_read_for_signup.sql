/*
  # Allow Anonymous Read of Schools

  ## Summary
  The signup page needs to show the school dropdown before a user is logged in.
  This adds an anon SELECT policy so the schools list loads on the public signup form.
*/

CREATE POLICY "Anonymous users can read schools"
  ON schools FOR SELECT
  TO anon
  USING (true);
