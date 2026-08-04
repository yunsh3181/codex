# Windows kiosk auto update

## Bootstrap limitation

Version 1.0.3 does not contain `electron-updater`, so it cannot update itself.
Install version 1.1.0 once with the architecture-matching NSIS installer.
Automatic updates can then be validated and used from 1.1.0 to later versions.
Portable builds intentionally do not enable automatic updates.

## Release process

1. Increment the unique `package.json` version and merge the release commit to `main`.
2. Create and push the matching tag, such as `v1.1.0`.
3. The `Windows release` workflow verifies that the tag equals `v${package.version}`.
4. GitHub Actions builds ia32 and x64 separately and uploads:
   - `PapaJohns-Kiosk-Setup-<version>-ia32.exe`
   - `PapaJohns-Kiosk-Setup-<version>-ia32.exe.blockmap`
   - `latest-ia32.yml`
   - `PapaJohns-Kiosk-Setup-<version>-x64.exe`
   - `PapaJohns-Kiosk-Setup-<version>-x64.exe.blockmap`
   - `latest-x64.yml`

Do not republish an existing version. The repository is public, so the installed
application does not contain a GitHub token.

## Operational behavior

- The installed NSIS application checks after 15 seconds and every 6 hours.
- Downloads run in the background and failures do not block ordering.
- Press `Ctrl+Alt+Shift+U` to open the administrator-only update panel.
- The administrator may update while the store is open. Restart installation is
  blocked only while an order, payment, Firestore save, or printer task is active.
- The application selects `latest-ia32.yml` or `latest-x64.yml` from its runtime
  architecture. It never falls back to the other architecture.
- Closing the panel defers the downloaded update. On a later launch it remains
  subject to the same administrator approval and operational safety checks.

## End-to-end validation

After two updater-capable releases exist:

1. On Windows 10 32-bit, install the older ia32 NSIS release.
2. Keep its settings and kiosk data, then publish the higher version.
3. Confirm background download from `latest-ia32.yml`.
4. Confirm that restart remains blocked during every operational busy state.
5. With the store open and no busy state, approve restart and verify the
   displayed application version increased while settings and data remain.
6. Repeat on x64 using `latest-x64.yml`.

The current project has no printer adapter or print queue. Its reported printer
busy state is therefore `false`; add the real queue signal before introducing a
printer adapter.

## Signing

No Windows code-signing certificate is configured. The generated installers are
unsigned and may trigger Microsoft SmartScreen reputation warnings. Configure a
trusted certificate in GitHub Actions before production rollout.
