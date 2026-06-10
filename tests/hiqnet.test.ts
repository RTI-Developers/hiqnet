import { describe, it, beforeAll, afterAll } from 'vitest';
import { harness } from './harness';
import { TEST_TIMEOUT, POLLING_INTERVAL } from './test-env';

// ── Suite ────────────────────────────────────────────────────────────────────

describe('HiQnet Driver', () => {
    beforeAll(harness.setup);
    afterAll(harness.teardown);

    // ── Connection Tests ──────────────────────────────────────────────────────
    it('connects to the HiQnet device', async () => {
        await harness.expectSysvar('Connected1', true, { timeout: TEST_TIMEOUT });
        await harness.delay(5_000);
    });

    it('sets parameter1 to 0x00 and waits for sysvar response', async () => {
        await harness.delay(1_000);

        harness.call('setParameter', 1, 1, '00');
        await harness.expectSysvar('ParameterBoolValue1_1', false, { timeout: 1_000 });
    });

    it('sets parameter1 to 0x01 and waits for sysvar response', async () => {
        await harness.delay(1_000);

        harness.call('setParameter', 1, 1, '01');
        await harness.expectSysvar('ParameterBoolValue1_1', true, { timeout: 1_000 });
    });
});
