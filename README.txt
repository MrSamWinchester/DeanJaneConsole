Dean Jane Console
=================
Open console.html in Chrome or Edge, click the folder button (bottom left) and pick your folder.
Files are read locally and never uploaded. The folder is remembered; the first click on the page reopens it.

Folder conventions (names are matched by the folder, Russian or English)
  Discography/<Album>/        songs + cover.jpg   (track order comes from file tags, TRCK / TRACKNUMBER)
  Lyrics/<Album>/*.txt        grouped by album, ordered by the Discography track number (titles must match)
  Demos/<Album>/              same as Lyrics
  Videos/<Album>/             videos; a folder named "Lyric Videos" goes to the Lyric Videos column
  Docs/Music/                 Music > Docs  
  Docs/Novels/                Novels > Docs
  Notes/, Bibliography/       Novels > Notes / Bibliography
  Videos/Novels/              Novels > Videos

Dates: click the DATE text in the right panel to change it. "By date" (default) sorts newest first.
Docs, Notes and Bibliography use a fixed 914px details panel.
Old version is in backup-v1/. To bring the old "All" screen back, set SHOW_ALL_IN_MENU = true at the top of app.js.

Opening the last folder automatically
-------------------------------------
Chrome only lets a page re-open a saved folder after you allow it. If you open console.html straight from disk (file://),
Chrome may ask again on every visit. To make it fully automatic:
  1. Run start-console.bat (needs Python) and use http://localhost:8765/console.html as your bookmark.
  2. Pick your folder once and choose "Allow on every visit" in Chrome's prompt.
From then on the folder loads by itself. (A new address means choosing the folder once more.)

GOOGLE DRIVE (files load from Drive instead of this computer)
==============================================================
Click "Choose Folder" > Google Drive, paste the folder link and your OAuth Client ID, press Connect.
The console asks Google for READ-ONLY access. It never changes, deletes or uploads anything.
Use the same Drive folder on any device: open the console there, connect once, done.
The folder structure and naming conventions are the same as above. Google Docs inside the folder are read as text.

One-time setup (about 5 minutes, free)
  1. Go to https://console.cloud.google.com and create a project (any name).
  2. APIs & Services > Library > search "Google Drive API" > Enable.
  3. APIs & Services > OAuth consent screen: User type External, fill app name and your email,
     add yourself under "Test users" (or press "Publish app" so the sign-in doesn't expire every 7 days).
  4. APIs & Services > Credentials > Create credentials > OAuth client ID > Application type: Web application.
     Authorized JavaScript origins: add http://localhost:8765  (and your https address if you host the console online).
     Do not add a redirect URI. Copy the Client ID (looks like 123-abc.apps.googleusercontent.com).
  5. Run start-console.bat and open http://localhost:8765/console.html. Google sign-in does NOT work from file://.
  6. Choose Folder > Google Drive > paste the folder link ("Share" > "Copy link") and the Client ID > Connect.

Notes
  - Sign-in lasts about an hour and renews itself while the page is open. If Chrome blocks the silent renewal,
    press Refresh and sign in again. The page remembers the folder and Client ID on this device.
  - Songs and videos stream from Drive, so the first play is slower than local files. Large videos need a good connection.
  - Edited dates are saved in this browser per Drive folder, same as with local folders.
  - To host it online (to use on your phone): upload the three files to any https hosting (GitHub Pages, Netlify)
    and add that address to Authorized JavaScript origins.

Files needed for Google Drive (4 files, keep them together in the same folder)
  console.html, style.css, app.js, sw.js
  sw.js is a small helper that streams songs, videos and covers from Drive with your sign-in.
  When you update the site on GitHub, upload all four files. After uploading press Ctrl+F5 once,
  and if songs do not play, close the tab and open the site again (the helper updates on reload).

PROFILES (sign in / create account)
===================================
On start you see a short loader, then Sign In / Create Account, then (only if no folder is saved yet) the
Choose Source window, then a loader with status text, then the app.
  - Nickname is the login. It always starts with @ and can be typed in any letter case (login ignores case).
  - Name shown in the logo: "First Last", or the nickname if "Prefer nickname over name" was ticked.
  - "Remember me on this device" keeps you signed in; without it you sign in again after closing the tab.
  - Sign out: the arrow button at the bottom of the menu.
  - Profiles are stored in this browser on this device only (passwords are salted and hashed, never saved as text).
    A profile created on one device does not exist on another one yet. The chosen folder / Drive is shared by
    all profiles on the same device.
