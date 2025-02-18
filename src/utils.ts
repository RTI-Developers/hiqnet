function hexStringToNumber(hex: string): number {
    const prefix = hex.substring(0, 2) == '0x' ? '' : '0x';
    return parseInt(prefix + hex, 16);
}

// Convert a hex string to a byte array
function hexToBytes(hex: string) : number[] {
    const bytes = [] as number[];
    for (let c = 0; c < hex.length; c += 2) {
        bytes.push(parseInt(hex.substring(c, c + 2), 16));
    }
    return bytes;
}

// Convert a byte array to a hex string
function bytesToHex(bytes: Uint8Array) : string {
    const hex = [] as string[];
    for (let i = 0; i < bytes.length; i++) {
        const current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
        hex.push((current >>> 4).toString(16));
        hex.push((current & 0xF).toString(16));
    }
    return hex.join('');
}
