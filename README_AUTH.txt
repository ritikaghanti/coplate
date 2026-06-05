BACKEND AUTH — apply steps
==========================
1. Copy these files into your project (cp -R ... .)
2. Add a JWT secret to apps/api/.env:
     JWT_SECRET=<any long random string, e.g. run: openssl rand -base64 32>
3. Run MIGRATION_AUTH.sql in the Neon SQL Editor.
4. Install the new dependencies (from repo root):
     pnpm install
5. Restart the API:  cd apps/api && pnpm dev
6. Test with curl (replace IP):
     curl -X POST http://10.2.1.5:3000/auth/signup \
       -H "Content-Type: application/json" \
       -d '{"email":"me@test.com","password":"mypassword123"}'
   You should get back {"token":"...","user":{...}}.
   Then the same with /auth/login.

NOTE: After this, the mobile app will get 401s on every request until we
add the login UI (next changeset), because the app doesn't send a token yet.
That's expected — the backend is locked down first, app second.
