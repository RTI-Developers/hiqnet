import * as path from 'path';
import * as os from 'os';
import { createHarness } from '@rti-developers/test-harness';
import { TEST_CONFIG, TEST_DEVICE } from './test-env';

// ─── Get machine's routable network IP for System.IPAddress ──────
function getNetworkIP(): string {
    const privatePrefixes = [
        '10.', '172.16.', '172.17.', '172.18.', '172.19.',
        '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
        '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
        '172.30.', '172.31.', '192.168.',
    ];

    const interfaces = os.networkInterfaces();
    const privateIps: string[] = [];
    const otherIps: string[] = [];

    for (const [name, ifaces] of Object.entries(interfaces)) {
        for (const iface of ifaces || []) {
            if (!iface.internal && iface.family === 'IPv4') {
                if (privatePrefixes.some(p => iface.address!.startsWith(p))) {
                    privateIps.push(iface.address!);
                } else {
                    otherIps.push(iface.address!);
                }
            }
        }
    }

    if (privateIps.length > 0) return privateIps[0];
    for (const ip of otherIps) {
        if (!ip.startsWith('127.0.0.1')) return ip;
    }
    return '127.0.0.1';
}

// ─── Minimal System shim (Logger/GlobalHandleMap are resolved via tsconfig, not globals) ──
(globalThis as any).System = {
    LogError:  (msg: string) => process.stderr.write('[ERR] ' + msg + '\n'),
    LogInfo:   (_lv: number, msg: string) => process.stdout.write('[INFO] ' + msg + '\n'),
} as any;

// ─── Manual polyfills (NOT provided by test-harness or sdk-utils) ──

/** ScheduledEvent shim — not provided by any SDK package. */
class ScheduledEventShim {
    Handle = 999;
    Enabled = false;
    UseHandleInCallbacks = false;

    constructor(
        _cb: (h: number) => void,
        _type: string,
        _intervalType: string,
        _interval: number,
    ) {}

    Enable(): boolean { return true; }
    Disable(): boolean { return true; }
    Reschedule(
        _cb: (h: number) => void,
        _type: string,
        _intervalType: string,
        _interval: number,
    ): ScheduledEventShim {
        return this;
    }
}
(globalThis as any).ScheduledEvent = ScheduledEventShim;

// ─── Harness ───────────────────────────────────────────────────────
const networkIP = getNetworkIP();
console.log(`[HARNESS] Using System.IPAddress = ${networkIP}`);

export const harness = createHarness({
    driver: path.resolve(__dirname, '../dist/index.js'),
    config: TEST_CONFIG,
    system: { IPAddress: networkIP, LogLevel: 3, },
});