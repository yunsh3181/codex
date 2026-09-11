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
4. GitHub Actions builds the Windows 10 32-bit ia32 target and uploads exactly:
   - `PapaJohns-Kiosk-Setup-<version>-ia32.exe`
   - `PapaJohns-Kiosk-Setup-<version>-ia32.exe.blockmap`
   - `latest-ia32.yml`

Do not republish an existing version. The repository is public, so the installed
application does not contain a GitHub token.

## Operational behavior

- The installed NSIS application checks after 15 seconds and every 6 hours.
- Checks and downloads run in the background without a clock or schedule gate;
  failures leave the current version available for ordering.
- Press `Ctrl+Alt+Shift+U` to open the administrator-only update panel.
- Restart installation is deferred while the customer is outside the home/idle
  screen or an order, payment, Firestore save, order-number transaction, seat hold,
  printer task, or unrecovered order error is active.
- A verified download installs and restarts automatically when the renderer reports
  a safe home/idle state. A normal application quit also applies the verified update.
- The application accepts only the ia32 runtime and `latest-ia32.yml` channel.

## Differential download

- `electron-updater` keeps `disableDifferentialDownload=false`, and NSIS builds set
  `differentialPackage=true`.
- The Setup EXE, its blockmap, and `latest-ia32.yml` are generated and verified as one
  immutable release set. SHA-512 validation is performed before installation.
- The administrator panel reports the differential plan and transferred bytes.
- If the previous blockmap is unavailable or range download fails,
  `electron-updater` falls back to the complete Setup installer. A corrupt download
  is rejected and the running version remains available.

## End-to-end validation

After two updater-capable releases exist:

1. On Windows 10 32-bit, install the older ia32 NSIS release.
2. Keep its settings and kiosk data, then publish the higher version.
3. Confirm background download from `latest-ia32.yml`.
4. Confirm that restart remains blocked during every operational busy state.
5. Return to the home/idle screen with no busy state and verify automatic restart,
   the displayed version increase, and preserved settings and data.
6. Confirm the differential log reports fewer transferred bytes than the complete
   Setup EXE, then repeat with the old blockmap removed to verify full fallback.

The current project has no printer adapter or print queue. Its reported printer
busy state is therefore `false`; add the real queue signal before introducing a
printer adapter.

## Signing

Windows Authenticode signature verification could not be tested because the current
deployment configuration contains neither a code-signing certificate nor
`publisherName`. SHA-512 integrity verification and rejection of corrupt downloads
are tested separately. Code signing must be introduced as a separate security task.
The generated installers remain unsigned and may trigger Microsoft SmartScreen
reputation warnings; do not describe them as signed before that work is complete.
