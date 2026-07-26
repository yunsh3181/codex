# Quick one-time kiosk authentication bootstrap

This procedure bootstraps Firebase Auth once. It does not store the custom token; later
launches use the Firebase Auth user persisted in the Windows profile.

## 1. Prepare a Firebase service account

In the Firebase/Google Cloud console for `papajohns-kiosk`, create or select a narrowly
controlled service account that can create Firebase custom tokens. Download its JSON
key only to an administrator or development PC. Never place the JSON in this repository.

Store it in an access-controlled directory outside the checkout. Set
`GOOGLE_APPLICATION_CREDENTIALS` to its absolute path, or pass that path using
`--service-account`. Rotate and revoke the key according to the operating security policy.

## 2. Create a custom token

Install repository dependencies, then run:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\secure\papajohns-kiosk-service-account.json'
node scripts/create-kiosk-custom-token.js --store-id pangyo2-techno-valley --kiosk-id mobile-01
```

Or use an explicit path:

```powershell
node scripts/create-kiosk-custom-token.js --service-account C:\secure\papajohns-kiosk-service-account.json --store-id pangyo2-techno-valley --kiosk-id mobile-01
```

The script refuses credentials for any project other than `papajohns-kiosk`. The token
is printed once to standard output. Copy it directly to the target kiosk and do not put
it in shell history, chat, tickets, screenshots, log files, GitHub, or source code.

## 3. Bootstrap the Windows kiosk

Before bootstrap, fully exit PapaJohns Kiosk. Open Windows Task Manager and confirm that
no `PapaJohns-Kiosk.exe` process remains. Do not continue while an order or payment is in
progress. The bootstrap script never terminates the application; if it finds the selected
executable already running, or cannot safely verify the path of a same-named process, it
stops before setting the token environment variable.

From the checkout or a securely copied scripts directory on the kiosk:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\bootstrap-kiosk-auth.ps1
```

Paste the token into the hidden prompt. The script finds the electron-builder executable
at `%LOCALAPPDATA%\Programs\PapaJohns-Kiosk\PapaJohns-Kiosk.exe`, starts it with the
credential in the current process environment, and immediately removes that environment
value. It does not write the token to a file, Registry, user environment, or system
environment. For a nonstandard installation, pass `-ExecutablePath`.

## 4. Verify initial authentication and presence

Open kiosk diagnostics and confirm these stages, without a token or UID appearing:

- `authentication-complete`
- `channel-created`
- `presence-write-success`
- `heartbeat-started`
- `connected`

On the administrator screen, confirm the kiosk Presence shows one active session for
`pangyo2-techno-valley/mobile-01`. Enter administrator test mode and confirm its command
ACK if that is part of the site acceptance check.

## 5. Verify persistence

After confirming initial authentication, fully exit the kiosk and verify in Task Manager
that `PapaJohns-Kiosk.exe` is gone. Start it normally, without the bootstrap script and
without `PJ_KIOSK_FIREBASE_CUSTOM_TOKEN`. Confirm `authentication-complete` and the
presence stages again. Diagnostics should show `credentialSource: firebase-persistence`
and a current user.

## 6. Recovery and security

If `KIOSK_AUTH_REQUIRED` returns, confirm the kiosk is running under the same Windows
account and the same Electron user-data profile. If the Windows user data, Firebase Auth
storage, or application profile was deleted, repeat registration with a newly generated
token. Also repeat bootstrap after an explicit sign-out.

Never retain custom tokens or service-account private keys in the repository, installer,
package metadata, environment persistence, Registry, logs, or support systems. Do not
reuse a token for another store or kiosk. Revoke a service-account key immediately if
exposure is suspected.
