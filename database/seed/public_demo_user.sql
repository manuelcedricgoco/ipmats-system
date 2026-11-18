-- Demo Public account (password Dpwh360!Demo2026). No requested staff role, so the
-- handle_new_user trigger creates an APPROVED profile with role 'public'.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'fac22308-098c-50c6-91d1-7658480fef8d', 'authenticated', 'authenticated', 'public@dpwh360.local', extensions.crypt('Dpwh360!Demo2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Liza Manalo"}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('4b5e17a1-bfcb-5cab-8b87-7ef9083550fd', 'fac22308-098c-50c6-91d1-7658480fef8d', 'fac22308-098c-50c6-91d1-7658480fef8d', '{"sub":"fac22308-098c-50c6-91d1-7658480fef8d","email":"public@dpwh360.local","email_verified":true}'::jsonb, 'email', now(), now(), now())
on conflict do nothing;
