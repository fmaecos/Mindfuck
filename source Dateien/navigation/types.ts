export type RootStackParamList = {
  Tabs: undefined;
  Login: undefined;
  MachineDetail: { id: string; name?: string };
  CreateMachine: undefined;
  Desktop: { id: string; name?: string };
  Terminal: { id: string; name?: string };
  ApiKeys: undefined;
  Sessions: undefined;
  Members: undefined;
  Secrets: undefined;
  Webhooks: undefined;
  Ports: undefined;
  Usage: undefined;
  Templates: undefined;
  AddProfile: undefined;
};

export type TabParamList = {
  Machines: undefined;
  Snapshots: undefined;
  Assistant: undefined;
  Access: undefined;
  Account: undefined;
};
