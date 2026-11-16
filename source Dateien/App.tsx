import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { SessionProvider, useSession } from './lib/store';
import { DialogProvider, ThemeProvider, useTheme } from './components/ui';
import LoginScreen from './screens/LoginScreen';
import MachinesScreen from './screens/MachinesScreen';
import SnapshotsScreen from './screens/SnapshotsScreen';
import AssistantScreen from './screens/AssistantScreen';
import AccessScreen from './screens/AccessScreen';
import AccountScreen from './screens/AccountScreen';
import MachineDetailScreen from './screens/MachineDetailScreen';
import CreateMachineScreen from './screens/CreateMachineScreen';
import DesktopScreen from './screens/DesktopScreen';
import TerminalScreen from './screens/TerminalScreen';
import ApiKeysScreen from './screens/ApiKeysScreen';
import SessionsScreen from './screens/SessionsScreen';
import MembersScreen from './screens/MembersScreen';
import SecretsScreen from './screens/SecretsScreen';
import WebhooksScreen from './screens/WebhooksScreen';
import PortsScreen from './screens/PortsScreen';
import UsageScreen from './screens/UsageScreen';
import TemplatesScreen from './screens/TemplatesScreen';
import type { RootStackParamList, TabParamList } from './navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Machines: { on: 'cube', off: 'cube-outline' },
  Snapshots: { on: 'save', off: 'save-outline' },
  Assistant: { on: 'sparkles', off: 'sparkles-outline' },
  Access: { on: 'key', off: 'key-outline' },
  Account: { on: 'person-circle', off: 'person-circle-outline' },
};

function Tabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.faint,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          height: 66,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarIconStyle: { height: 22, marginTop: 0 },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', lineHeight: 14, height: 16, marginTop: 2 },
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? TAB_ICONS[route.name].on : TAB_ICONS[route.name].off} size={21} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Machines" component={MachinesScreen} />
      <Tab.Screen name="Snapshots" component={SnapshotsScreen} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
      <Tab.Screen name="Access" component={AccessScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

function AddProfileScreen({ navigation }: any) {
  return <LoginScreen onConnected={() => navigation.goBack()} />;
}

function Root() {
  const t = useTheme();
  const { session, ready } = useSession();

  const navTheme = {
    ...(t.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.dark ? DarkTheme : DefaultTheme).colors,
      primary: t.accent,
      background: t.bg,
      card: t.surface,
      text: t.text,
      border: t.border,
      notification: t.accent,
    },
  };

  if (!ready) return null;

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="MachineDetail" component={MachineDetailScreen} options={{ title: 'Sandbox' }} />
            <Stack.Screen name="CreateMachine" component={CreateMachineScreen} options={{ title: 'Neue Sandbox' }} />
            <Stack.Screen
              name="Desktop"
              component={DesktopScreen}
              options={{ title: 'Desktop', headerBackTitle: 'Sandbox' }}
            />
            <Stack.Screen name="Terminal" component={TerminalScreen} options={{ title: 'Terminal' }} />
            <Stack.Screen name="ApiKeys" component={ApiKeysScreen} options={{ title: 'API-Schlüssel' }} />
            <Stack.Screen name="Sessions" component={SessionsScreen} options={{ title: 'Anmeldungen' }} />
            <Stack.Screen name="Members" component={MembersScreen} options={{ title: 'Mitglieder' }} />
            <Stack.Screen name="Secrets" component={SecretsScreen} options={{ title: 'Org Secrets' }} />
            <Stack.Screen name="Webhooks" component={WebhooksScreen} options={{ title: 'Webhooks' }} />
            <Stack.Screen name="Ports" component={PortsScreen} options={{ title: 'Öffentliche Ports' }} />
            <Stack.Screen name="Usage" component={UsageScreen} options={{ title: 'Nutzung' }} />
            <Stack.Screen name="Templates" component={TemplatesScreen} options={{ title: 'Vorlagen' }} />
            <Stack.Screen
              name="AddProfile"
              component={AddProfileScreen}
              options={{ title: 'Verbindung hinzufügen', presentation: 'modal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <ThemeProvider>
            <DialogProvider>
              <Root />
            </DialogProvider>
          </ThemeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
