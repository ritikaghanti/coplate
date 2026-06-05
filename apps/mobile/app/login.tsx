import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { theme } from "../lib/theme";

export default function Login() {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    try {
      setError(null);
      setBusy(true);
      if (mode === "login") await signIn(email.trim(), password);
      else await register(email.trim(), password);
      // On success, the root layout swaps to the app automatically.
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      // Surface the API's friendly message if present.
      setError(msg.replace(/^API \d+: /, "").replace(/[{}"]/g, "").replace("error:", "").trim() || msg);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.brand}>Coplate</Text>
        <Text style={styles.tagline}>Snap your plate. Know your macros.</Text>

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={theme.color.textMuted}
        />

        <Text style={styles.fieldLabel}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          placeholderTextColor={theme.color.textMuted}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.primaryBtn} disabled={busy} onPress={submit}>
          {busy ? (
            <ActivityIndicator color="#1A140C" />
          ) : (
            <Text style={styles.primaryBtnText}>{mode === "login" ? "Log in" : "Create account"}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
          style={styles.switch}
        >
          <Text style={styles.switchText}>
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  inner: { flex: 1, justifyContent: "center", padding: theme.space(6) },
  brand: { color: theme.color.text, fontSize: 40, fontFamily: theme.font.display, fontWeight: "700", textAlign: "center" },
  tagline: { color: theme.color.textMuted, fontSize: 15, textAlign: "center", marginTop: theme.space(2), marginBottom: theme.space(8) },
  fieldLabel: { color: theme.color.text, fontSize: 14, fontWeight: "600", marginBottom: theme.space(2), marginTop: theme.space(3) },
  input: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border, color: theme.color.text,
    fontSize: 16, padding: theme.space(4),
  },
  error: { color: theme.color.danger, marginTop: theme.space(4) },
  primaryBtn: { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill, paddingVertical: theme.space(5), alignItems: "center", marginTop: theme.space(6) },
  primaryBtnText: { color: "#1A140C", fontSize: 17, fontWeight: "700" },
  switch: { alignItems: "center", marginTop: theme.space(5) },
  switchText: { color: theme.color.accent, fontSize: 14 },
});
