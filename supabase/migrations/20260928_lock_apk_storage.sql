-- Public read remains for existing download links. Only a privileged server
-- process may upload/replace a distributable APK.
drop policy if exists "Allow Update to APKs" on storage.objects;
drop policy if exists "Allow Upload to APKs" on storage.objects;
