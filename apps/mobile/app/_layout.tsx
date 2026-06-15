import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../lib/AuthContext";
import { theme } from "../lib/theme";

/**
 * Routes the user to /login when signed out and into the app when signed in.
 */
function useAuthRouting() {
  const { ready, isAuthed } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === "login";
    if (!isAuthed && !onLogin) router.replace("/login");
    else if (isAuthed && onLogin) router.replace("/");
  }, [ready, isAuthed, segments, router]);
}

function RootNav() {
  const { ready } = useAuth();
  useAuthRouting();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={theme.color.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.bg },
        headerTintColor: theme.color.text,
        headerTitleStyle: { fontFamily: theme.font.display },
        contentStyle: { backgroundColor: theme.color.bg },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ title: "Coplate" }} />
      <Stack.Screen name="capture" options={{ title: "Snap your plate", presentation: "modal" }} />
      <Stack.Screen name="save-room" options={{ title: "Save Room", presentation: "modal" }} />
      <Stack.Screen name="profile" options={{ title: "Dietary profile", presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <RootNav />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
