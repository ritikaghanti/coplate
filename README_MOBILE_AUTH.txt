MOBILE AUTH — apply steps
=========================
PREREQ: the backend auth changeset (changeset-4) must already be applied,
migrated, and running. Your curl signup/login should work.

1. Copy these files in:
     cd /Users/apple/Downloads/coplate-2
     cp -R ~/Downloads/coplate-changeset-5-mobile-auth/. .

2. IMPORTANT — fix your API_BASE. This changeset ships apps/mobile/lib/api.ts
   with the placeholder IP (192.168.1.100). Open it and set your real IP:
     export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://10.2.1.5:3000";
   (Or better: create apps/mobile/.env with
     EXPO_PUBLIC_API_BASE=http://10.2.1.5:3000
   so it's never clobbered again.)

3. Install the secure storage library (picks the SDK-54 version):
     cd apps/mobile
     npx expo install expo-secure-store

4. Restart Metro with a clear cache:
     pnpm start --clear

5. On the phone: you should now see a LOGIN screen. Use the same email/
   password you created with curl, OR tap "Sign up" to make a new account.
   After logging in, all your features work again — now tied to your account.

WHAT CHANGED
- New login/signup screen (toggles between the two).
- Token stored securely in the iOS keychain (expo-secure-store).
- Every API request now sends the token automatically.
- App launches to login if signed out, home if signed in.
- "Sign out" added to the home screen top-right.
