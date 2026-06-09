class HiQnetUtils {
    public static parseMessage(messageHex: string, expectedProtocolVersion: string): HiQnetMessage {
		if (messageHex.length < STD_HEADER_LEN * 2) {
            throw new Error('Message too short to contain valid HiQnet header: ' + messageHex);
		}

		const protocolVersionHex = messageHex.substring(0, 2);
		if (protocolVersionHex != expectedProtocolVersion) {
			throw new Error('Unsupported HiQnet protocol version: 0x' + protocolVersionHex);
		}

        const totalLengthBytes = hexToUnsignedInt(messageHex.substring(4, 12));
        if (messageHex.length < totalLengthBytes * 2) {
            throw new Error('Message hex length ' + messageHex.length + ' is shorter than total length in header: ' + totalLengthBytes * 2);
        }

		const headerLenBytes = hexToUnsignedInt(messageHex.substring(2, 4));
		const payloadStart   = headerLenBytes * 2;

        return {
            Flags: hexToUnsignedInt(messageHex.substring(40, 44)),
            HeaderLengthBytes: headerLenBytes,
            MessageId: parseInt(messageHex.substring(36, 40), 16),
            Payload: messageHex.substring(payloadStart),
            SeqNum: hexToUnsignedInt(messageHex.substring(46, 50)),
            SourceAddress: messageHex.substring(12, 24),
            TotalLengthBytes: totalLengthBytes
        };
    }

    // Number of hex chars (2 per byte) for a HiQnet fixed-size data type enum.
    // Returns -1 for variable-length types (BLOCK, STRING).
    public static hexCharsForDataType(dataType: HiQnetDataType): number {
        switch (dataType) {
            case HiQnetDataType.HQ_BYTE:
            case HiQnetDataType.HQ_UBYTE:
                return 2;
            case HiQnetDataType.HQ_WORD:
            case HiQnetDataType.HQ_UWORD:
                return 4;
            case HiQnetDataType.HQ_LONG:
            case HiQnetDataType.HQ_ULONG:
            case HiQnetDataType.HQ_FLOAT32:
                return 8;
            case HiQnetDataType.HQ_FLOAT64:
            case HiQnetDataType.HQ_LONG64:
            case HiQnetDataType.HQ_ULONG64:
                return 16;
            case HiQnetDataType.HQ_BLOCK:
            case HiQnetDataType.HQ_STRING:
                return -1;
            default:
                return -1;
        }
    }

    public static isValidDataType(value: number): boolean {
        // If it's not in the enum, HiQnetDataType[value] returns undefined
        return value in HiQnetDataType;
    }

    public static hexToDataType(hex: string): HiQnetDataType | null {
        const value = hexStringToNumber(hex);
        return HiQnetUtils.isValidDataType(value) ? value as HiQnetDataType : null;
    }

    public static decodeHiQnetNumericValue(dataType: HiQnetDataType, hex: string): number {
        switch (dataType) {
            case HiQnetDataType.HQ_BYTE:
            case HiQnetDataType.HQ_WORD:
            case HiQnetDataType.HQ_LONG:
            case HiQnetDataType.HQ_LONG64:
                return hexToSignedInt(hex);
            case HiQnetDataType.HQ_FLOAT32:
                return hexToFloat32(hex);
            case HiQnetDataType.HQ_FLOAT64:
                return hexToFloat64(hex);
            default:
                return hexToUnsignedInt(hex);
        }
    }

	public static decodeHiQnetStringValue(dataType: HiQnetDataType, valueHex: string): string {
		if (dataType == HiQnetDataType.HQ_STRING) {
			// HiQnet STRING is UTF-16BE with NULL terminator. Read pairs of bytes as chars.
			const out: string[] = [];
			for (let i = 0; i + 4 <= valueHex.length; i += 4) {
				const code = hexToUnsignedInt(valueHex.substring(i, i + 4));
				if (code == 0) break;
				out.push(String.fromCharCode(code));
			}
			return out.join('');
		}
		// For non-STRING types, return the numeric value as a decimal string.
		const n = HiQnetUtils.decodeHiQnetNumericValue(dataType, valueHex);
		return n.toString();
	}

    public static parseIpToHex(ipStr: string): string {
		if (!ipStr) {
            return ZERO_IP_ADDRESS;
		}

		const parts = ipStr.split('.');

		if (parts.length !== 4) {
            return ZERO_IP_ADDRESS;
		}

		let hex = '';

		for (let i = 0; i < 4; i++) {
			const n = parseInt(parts[i], 10);
			if (isNaN(n) || n < 0 || n > 255) {
                return ZERO_IP_ADDRESS;
			}
			hex += n.toString(16).padLeft(2);
		}
		return hex;
	}

	public static hexToIpString(hex: string): string {
		if (!hex || hex.length < 8) {
            return '';
		}

		const parts: string[] = [];

		for (let i = 0; i < 8; i += 2) {
			parts.push(hexToUnsignedInt(hex.substring(i, i + 2)).toString(10));
		}
		return parts.join('.');
	}

    public static createFullAddress(deviceAddress: string, virtualDeviceAddress: string, objectId: string): string {
		return deviceAddress.padLeft(4) + virtualDeviceAddress.padLeft(2) + objectId.padLeft(6);
	}
}