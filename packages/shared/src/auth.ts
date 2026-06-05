import { z } from "zod";

/** Signup and login share the same credential shape. */
export const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});
export type Credentials = z.infer<typeof CredentialsSchema>;

/** What the auth endpoints return: a token plus minimal user info. */
export const AuthResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
  }),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
