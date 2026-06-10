import { describe, it, beforeAll, afterAll } from 'vitest';
import { harness } from './harness';
import { TEST_TIMEOUT, POLLING_INTERVAL } from './test-env';

// ── Manual 3rd-Party Tests ─────────────────────────────────────────────────
// These tests expect an external controller (e.g., Audio Architect) to modify
// parameter values on the Crown amp. The driver under test should receive
// MultiParamSet subscription pushes and update its local sysvars accordingly.
//
// Usage: Open the same amp in Audio Architect, toggle parameters manually,
// then run this test suite to verify the driver's subscription mechanism
// is functioning correctly.

describe('HiQnet Driver — 3rd Party Manual Tests', () => {
    beforeAll(harness.setup);
    afterAll(harness.teardown);

    it('connects to the HiQnet device', async () => {
        await harness.expectSysvar('Connected1', true, { timeout: TEST_TIMEOUT });
        await harness.delay(5_000);
    });

    // ── Manual intervention tests ────────────────────────────────────────
    // Before running these tests, use Audio Architect (or another HiQnet
    // controller) to set ParameterBoolValue1_1 and ParameterBoolValue1_2 to the expected target values.
    // The test verifies the driver sysvar catches up within the timeout.

    it('[MANUAL] verify Channel A Mute reflects 3rd-party change to false', async () => {
        // Precondition: Set ParameterBoolValue1_1 = false in Audio Architect
        await harness.expectSysvar('ParameterBoolValue1_1', false, { timeout: TEST_TIMEOUT });
    });

    it('[MANUAL] verify Channel A Mute reflects 3rd-party change to true', async () => {
        // Precondition: Set ParameterBoolValue1_1 = true in Audio Architect
        await harness.expectSysvar('ParameterBoolValue1_1', true, { timeout: TEST_TIMEOUT });
    });

    it('[MANUAL] verify Channel B Mute reflects 3rd-party change to false', async () => {
        // Precondition: Set ParameterBoolValue1_2 = false in Audio Architect
        await harness.expectSysvar('ParameterBoolValue1_2', false, { timeout: TEST_TIMEOUT });
    });

    it('[MANUAL] verify Channel B Mute reflects 3rd-party change to true', async () => {
        // Precondition: Set ParameterBoolValue1_2 = true in Audio Architect
        await harness.expectSysvar('ParameterBoolValue1_2', true, { timeout: TEST_TIMEOUT });
    });
});
