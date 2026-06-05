import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { theme } from "../lib/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.text,
          headerTitleStyle: { fontFamily: theme.font.display },
          contentStyle: { backgroundColor: theme.color.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Coplate" }} />
        <Stack.Screen name="capture" options={{ title: "Snap your plate", presentation: "modal" }} />
        <Stack.Screen name="save-room" options={{ title: "Save Room", presentation: "modal" }} />
        <Stack.Screen name="profile" options={{ title: "Dietary profile", presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
