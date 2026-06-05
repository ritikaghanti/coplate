import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { DIET_TYPES, type DietType, type DietaryProfile } from "@coplate/shared";
import { getProfile, updateProfile } from "../lib/api";
import { theme } from "../lib/theme";

export default function Profile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dietType, setDietType] = useState<DietType>("none");
  const [allergies, setAllergies] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setDietType(p.dietType);
        setAllergies(p.allergies);
        setDislikes(p.dislikes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    try {
      setError(null);
      setSaving(true);
      const body: DietaryProfile = { dietType, allergies, dislikes };
      await updateProfile(body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.color.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Tell me about your diet and I'll respect it everywhere I suggest food.
      </Text>

      <Text style={styles.fieldLabel}>Diet</Text>
      <View style={styles.chipRow}>
        {DIET_TYPES.map((d) => (
          <Pressable
            key={d.id}
            style={[styles.chip, dietType === d.id && styles.chipActive]}
            onPress={() => setDietType(d.id)}
          >
            <Text style={[styles.chipText, dietType === d.id && styles.chipTextActive]}>
              {d.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Allergies</Text>
      <TextInput
        style={styles.input}
        value={allergies}
        onChangeText={setAllergies}
        placeholder="e.g. peanuts, shellfish"
        placeholderTextColor={theme.color.textMuted}
        multiline
      />
      <Text style={styles.safetyNote}>
        I'll steer around these, but always check ingredients yourself — I can't
        guarantee a dish is allergen-free.
      </Text>

      <Text style={styles.fieldLabel}>Dislikes</Text>
      <TextInput
        style={styles.input}
        value={dislikes}
        onChangeText={setDislikes}
        placeholder="e.g. cilantro, mushrooms"
        placeholderTextColor={theme.color.textMuted}
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.primaryBtn} disabled={saving} onPress={save}>
        {saving ? (
          <ActivityIndicator color="#1A140C" />
        ) : (
          <Text style={styles.primaryBtnText}>Save</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  center: { flex: 1, backgroundColor: theme.color.bg, alignItems: "center", justifyContent: "center" },
  content: { padding: theme.space(5), paddingBottom: theme.space(12) },
  lead: { color: theme.color.textMuted, fontSize: 16, lineHeight: 23, marginBottom: theme.space(4) },
  fieldLabel: { color: theme.color.text, fontSize: 15, fontWeight: "600", marginBottom: theme.space(3), marginTop: theme.space(5) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) },
  chip: {
    paddingHorizontal: theme.space(4), paddingVertical: theme.space(3),
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  chipActive: { backgroundColor: theme.color.accentSoft, borderColor: theme.color.accent },
  chipText: { color: theme.color.textMuted, fontSize: 14 },
  chipTextActive: { color: theme.color.accent, fontWeight: "600" },
  input: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border, color: theme.color.text,
    fontSize: 16, padding: theme.space(4), minHeight: 52,
  },
  safetyNote: { color: theme.color.textMuted, fontSize: 13, marginTop: theme.space(2), lineHeight: 18, fontStyle: "italic" },
  error: { color: theme.color.danger, marginTop: theme.space(4) },
  primaryBtn: { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill, paddingVertical: theme.space(5), alignItems: "center", marginTop: theme.space(7) },
  primaryBtnText: { color: "#1A140C", fontSize: 17, fontWeight: "700" },
});
