# Flyff U Portal

A dedicated desktop browser for [Flyff Universe](https://universe.flyff.com), built with Electron.

## Features

- **Home launcher** – a single home window listing your saved accounts (e.g. "Knight", "Blade").
- **Multi-account** – click any account to open Flyff Universe in its own window with its own
  isolated session/cookies, so you can be logged into several accounts at the same time.
- **Saved credentials** – account username/password are stored locally, encrypted at rest using
  Electron's `safeStorage` (Windows DPAPI). They never leave your machine.
- **Persistent sessions** – each account keeps its own persistent session partition, so once
  you log in on Flyff Universe's own login form, that account stays logged in on future launches.
- **Extensions** – load unpacked (developer mode) Chrome extensions, applied to every account
  window.

## Getting started

```powershell
npm install
npm start
```

## Usage

1. Launch the app – the **Home** window opens.
2. Click **+ Add Account**, give it a label (e.g. "Knight"), and enter the Flyff Universe
   username/password for that character/account.
3. Click **Open** on an account card – a new window opens and loads Flyff Universe with that
   account's own session. Open as many accounts as you like; the Home window stays single.
4. Log in on Flyff Universe's own login form once per account; the persistent session partition
   keeps you logged in on future launches.
5. To add a browser extension, click **Load Extension...** on the Home page and pick the
   unpacked extension's folder (the one containing its `manifest.json`). It will be loaded into
   every account window.

## Security notes

- Credentials are encrypted on disk with `safeStorage` and are only decrypted in memory when
  needed (e.g. opening the account edit form).
- Each account uses its own persistent Chromium session partition, so cookies/local storage for
  different accounts never mix.
