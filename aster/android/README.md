# Aster for Android

This is a small app that opens Aster from your computer. It is not a second copy of Aster: your folders, videos and notes stay on the computer, and the phone shows them over your home Wi-Fi.

## Get the APK without installing anything (GitHub)
1. Make a free GitHub account and a new private repository, and upload this whole project to it.
2. Open the repository's **Actions** tab, choose **Build Android app**, press **Run workflow**.
3. After a few minutes open the finished run and download **Aster-apk** (a zip holding `app-debug.apk`).
4. Send the APK to your phone, open it, and allow "install from this source" when Android asks.

## Or build it yourself
Install Node 20, JDK 17 and Android Studio, then in this folder: `npm install`, `npx cap add android`, add `android:usesCleartextTraffic="true"` to the `<application>` tag in `android/app/src/main/AndroidManifest.xml`, `npx cap sync android`, and open the `android` folder in Android Studio to run or build.

## Using it
Start Aster on the computer, then in the desktop app choose **Aster, Tablet and phone access, Turn on**. Type the address it shows into the phone app (for example `192.168.1.20:5174`), then the PIN. The phone remembers the address.
To switch computers, open Aster's **Settings** inside the phone app and press **Change computer address**.
