// HiQnet data type enum (from spec section 3).
const HQ_BYTE = 0;
const HQ_UBYTE = 1;
const HQ_WORD = 2;
const HQ_UWORD = 3;
const HQ_LONG = 4;
const HQ_ULONG = 5;
const HQ_FLOAT32 = 6;
const HQ_FLOAT64 = 7;
const HQ_BLOCK = 8;
const HQ_STRING = 9;
const HQ_LONG64 = 10;
const HQ_ULONG64 = 11;

function hexToBytes(hex: string): number[] {
    const bytes: number[] = [];
    for (let c = 0; c + 1 < hex.length; c += 2) {
        bytes.push(parseInt(hex.substring(c, c + 2), 16));
    }
    return bytes;
}

function bytesToHex(bytes: number[]): string {
    const hex: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
        const b = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]) & 0xFF;
        hex.push((b >>> 4).toString(16));
        hex.push((b & 0xF).toString(16));
    }
    return hex.join('');
}

function hexStringToNumber(hex: string): number {
    if (!hex) return 0;
    return parseInt(hex, 16);
}

function hexToUnsignedInt(hex: string): number {
    if (!hex) return 0;
    return parseInt(hex, 16);
}

function hexToSignedInt(hex: string): number {
    if (!hex) return 0;
    const bits = hex.length * 4;
    let n = parseInt(hex, 16);
    if (bits >= 32) {
        // Avoid 2^32 precision loss; do bitwise sign-extend for exactly 32 bits.
        if (bits == 32) return n | 0;
    }
    const half = Math.pow(2, bits - 1);
    if (n >= half) {
        n -= half * 2;
    }
    return n;
}

function hexToFloat32(hex: string): number {
    if (!hex || hex.length < 8) return 0;
    const n = parseInt(hex.substring(0, 8), 16);
    if (n == 0 || n == 0x80000000) return 0;
    const sign = (n >>> 31) ? -1 : 1;
    const exp = ((n >>> 23) & 0xFF) - 127;
    const frac = n & 0x7FFFFF;
    if (exp == 128) return frac ? NaN : sign * Infinity;
    if (exp == -127) return sign * frac * Math.pow(2, -126 - 23);
    return sign * (frac | 0x800000) * Math.pow(2, exp - 23);
}

// Decode 1.15 signed fixed-point UWORD into a percentage 0-100 (negative allowed).
function hexToPercent115(hex: string): number {
    const n = hexToSignedInt(hex);
    return (n / 0x7FFF) * 100;
}

// Encode a percentage (0-100) into 1.15 signed fixed-point UWORD hex.
function percentToHex115(percent: number): string {
    if (percent > 100) percent = 100;
    if (percent < -100) percent = -100;
    let n = Math.round((percent / 100) * 0x7FFF);
    if (n < 0) n += 0x10000;
    return n.toString(16).padLeft(4);
}

// Number of hex chars (2 per byte) for a HiQnet fixed-size data type enum.
// Returns -1 for variable-length types (BLOCK, STRING).
function hexCharsForDataType(dataType: number): number {
    switch (dataType) {
        case HQ_BYTE: case HQ_UBYTE: return 2;
        case HQ_WORD: case HQ_UWORD: return 4;
        case HQ_LONG: case HQ_ULONG: case HQ_FLOAT32: return 8;
        case HQ_FLOAT64: case HQ_LONG64: case HQ_ULONG64: return 16;
        case HQ_BLOCK: case HQ_STRING: return -1;
        default: return -1;
    }
}

function decodeHiqnetValueHex(dataType: number, hex: string): number {
    switch (dataType) {
        case HQ_BYTE: case HQ_WORD: case HQ_LONG: case HQ_LONG64:
            return hexToSignedInt(hex);
        case HQ_FLOAT32:
            return hexToFloat32(hex);
        default:
            return hexToUnsignedInt(hex);
    }
}
