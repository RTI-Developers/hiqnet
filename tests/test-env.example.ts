/**
 * test-env.example.ts
 *
 * Copy this file to test-env.ts and fill in the values for your physical device.
 * This file is .gitignored — never commit real device IPs or addresses.
 */

export const TEST_DEVICE = {
  name: 'Your Device Name',
  hostname: 'your-device.local',
  ip: '192.168.1.XXX',
  port: 3804, // HiQnet default port
  nodeId: 1,  // HiQnet Node address on the network
  virtualDeviceId: 0,
} as const;

export const TEST_CONFIG: Record<string, string> = {
  TotalDeviceCount: '1',
  ProtocolVersion: '02',
  SourceAddress: 'XXX',            // Decimal value of our HiQnet source node
  DeviceName1: TEST_DEVICE.name,
  DeviceAddress1: TEST_DEVICE.ip,
  // Production settings: HiQnet Address = 1, Virtual Device = 0
  HiQnetDeviceAddress1: TEST_DEVICE.nodeId.toString(),
  HiQnetVirtualDeviceAddress1: TEST_DEVICE.virtualDeviceId.toString(),
  // Polling & debug
  PollingIntervalSeconds: '8',
  DebugTrace: 'false',
  // Parameters (update count, names, addresses, and IDs to match your config)
  DeviceParameterCount1: '2',

  ParameterName1_1: 'Parameter 1 Name',
  HiQnetObjectAddress1_1: 'XX.XX.X',       // HiQnet address in dotted notation (e.g., 15.22.7)
  ParameterId1_1: 'X',                      // Decimal parameter ID from config
  ParameterAllowSet1_1: 'true',
  ParameterDataType1_1: '01',               // 01 = Boolean/UBYTE (use correct type for param)
  ParameterSetMethod1_1: '1',
  ParameterEnableSubscribe1_1: 'true',
  ParameterVariableType1_1: '1',

  ParameterName1_2: 'Parameter 2 Name',
  HiQnetObjectAddress1_2: 'XX.XX.X',       // HiQnet address in dotted notation
  ParameterId1_2: 'X',                      // Decimal parameter ID from config
  ParameterAllowSet1_2: 'true',
  ParameterDataType1_2: '01',               // Match the actual DataType for this param
  ParameterSetMethod1_2: '1',
  ParameterEnableSubscribe1_2: 'true',
  ParameterVariableType1_2: '1',
};

export const POLLING_INTERVAL = 8000; // ms
export const TEST_TIMEOUT = 30000;    // ms
export const HOOK_TIMEOUT = 15000;    // ms
