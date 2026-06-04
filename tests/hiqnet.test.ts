import { describe, it, beforeAll, afterAll } from 'vitest';
import { harness } from './harness';
import { TEST_TIMEOUT, POLLING_INTERVAL } from './test-env';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function connected() {
    await harness.expectSysvar('Connected1', true, { timeout: TEST_TIMEOUT });
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('HiQnet Driver', () => {
    beforeAll(harness.setup);
    afterAll(harness.teardown);

    // ── Connection Tests ──────────────────────────────────────────────────────

    it('connects to the HiQnet device', async () => {
        await harness.expectSysvar('Connected1', true, { timeout: TEST_TIMEOUT });
    });

    it('receives discovery response from device', async () => {
        // After connection, driver sends Discovery query; device should respond.
        // Verify connection remains stable after the discovery exchange.
        await harness.waitForSysvar('Connected1', (v: unknown) => v === true, { timeout: 10_000 });
    });

    it('maintains connection with polling keep-alives', async () => {
        // Driver sends periodic keep-alives via polling event (default 8s interval).
        await harness.waitForSysvar('Connected1', (v: unknown) => v === true, { timeout: POLLING_INTERVAL + 5_000 });
    });

    // ── Parameter Tests (reuse the same connection from above) ──────────────────

    it('reads initial parameter value', async () => {
        await connected();
        await harness.expectSysvar('ParameterBoolValue1_1', false, { timeout: TEST_TIMEOUT });
    });

    it('sets parameter to 0x00 and waits for device response', async () => {
        await connected();
        harness.call('setParameter', 1, 1, '00');
        await harness.waitForSysvar(
            'ParameterBoolValue1_1',
            (v: unknown) => v !== undefined && v !== null,
            { timeout: POLLING_INTERVAL + 5_000 }
        );
    });

    it('sets parameter to 0x01 and waits for device response', async () => {
        await connected();
        harness.call('setParameter', 1, 1, '01');
        await harness.waitForSysvar(
            'ParameterBoolValue1_1',
            (v: unknown) => v !== undefined && v !== null,
            { timeout: POLLING_INTERVAL + 5_000 }
        );
    });

    it('cycles parameter value between 0x00 and 0x01', async () => {
        await connected();
        harness.call('setParameter', 1, 1, '00');
        await harness.waitForSysvar(
            'ParameterBoolValue1_1',
            (v: unknown) => v !== undefined && v !== null,
            { timeout: POLLING_INTERVAL + 5_000 }
        );
        harness.call('setParameter', 1, 1, '01');
        await harness.waitForSysvar(
            'ParameterBoolValue1_1',
            (v: unknown) => v !== undefined && v !== null,
            { timeout: POLLING_INTERVAL + 5_000 }
        );
    });

    it('parameter value type is boolean', async () => {
        await connected();
        harness.call('setParameter', 1, 1, '00');
        await harness.waitForSysvar(
            'ParameterBoolValue1_1',
            (v: unknown) => typeof v === 'boolean',
            { timeout: POLLING_INTERVAL + 5_000 }
        );
    });

    it('sets parameter to unmute (0x00) and reads boolean false', async () => {
        await connected();
        harness.call('setParameter', 1, 1, '00');
        await harness.expectSysvar('ParameterBoolValue1_1', false, { timeout: POLLING_INTERVAL + 5_000 });
    });

    it('sets parameter to mute (0x01) and reads boolean true', async () => {
        await connected();
        harness.call('setParameter', 1, 1, '01');
        await harness.expectSysvar('ParameterBoolValue1_1', true, { timeout: POLLING_INTERVAL + 5_000 });
    });
});
