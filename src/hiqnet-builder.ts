// ============================================================
// HiQnet Protocol Builder — constructs outgoing message payloads and headers
// ============================================================

/**
 * Builds a complete HiQnet header + payload for transmission.
 */
class HiQnetProtocolBuilder {
    /**
     * Constructs a Discovery info payload per HiQnet spec §8.3.
     */
    public static buildDiscoInfoPayload(
        sourceDeviceAddress: string,
        macAddress: string,
        serialNumber: string,
        ipAddress: string,
        netMask: string
    ): string {
        let payload = '';
        payload += sourceDeviceAddress;                  // Source Device Address (UWORD)
        payload += '01';                                 // Cost (1 = direct connection)
        payload += SERIAL_NUMBER_LENGTH;                 // Serial number length (UWORD)
        payload += serialNumber.padLeft(32);             // Serial number data (16 bytes)
        payload += MAX_MESSAGE_SIZE;                     // Max message size (ULONG)
        payload += '2710';                               // Keep-alive period (5 sec = 50 dec)
        payload += ETHERNET_NETWORK_ID;                  // Ethernet network ID
        payload += macAddress.padLeft(12);               // MAC address
        payload += DHCP_STATIC_IDENTIFIER;               // Static address identifier
        payload += ipAddress.padLeft(8);                 // Controller IP
        payload += netMask.padLeft(8);                   // Netmask
        payload += DEFAULT_GATEWAY_ADDRESS.padLeft(8);   // Default gateway
        return payload;
    }

    /**
     * Constructs a GetAttributes payload.
     */
    public static buildGetAttributesPayload(attributeIds: number[]): string {
        let payload = '';
        payload += attributeIds.length.toString(16).padLeft(4);
        for (const id of attributeIds) {
            payload += id.toString(16).padLeft(4);
        }
        return payload;
    }

    /**
     * Constructs a HiQnet message header for the given parameters.
     */
    public static buildHeader(
        protocolVersionHex: string,
        destAddress: string,
        sourceDeviceAddress: string,
        messageId: HiQnetMessageId,
        payloadByteLen: number,
        flagsBits: number
    ): string {
        const totalLen = STD_HEADER_LEN + payloadByteLen;
        const sourceAddress = HiQnetProtocolBuilder.createFullAddress(sourceDeviceAddress, DEFAULT_VIRTUAL_DEVICE_ADDRESS, DEFAULT_OBJECT_ID);

        let header = protocolVersionHex;
        header += STD_HEADER_LEN.toString(16).padLeft(2);
        header += totalLen.toString(16).padLeft(8);
        header += sourceAddress;
        header += destAddress;
        header += messageId.toString(16).padLeft(4);
        header += flagsBits.toString(16).padLeft(4);
        header += HOP_COUNT;
        header += '0000';

        return header;
    }
    
    /**
     * Constructs a MultiParamGet payload for a single group of parameters.
     */
    public static buildMultiParamGetPayload(paramIds: string[]): string {
        let payload = '';
        payload += paramIds.length.toString(16).padLeft(4);
        for (const id of paramIds) {
            payload += id.padLeft(4);
        }
        return payload;
    }
    
    /**
     * Constructs a MultiParamSet payload for a single parameter.
     */
    public static buildMultiParamSetPayload(
        paramId: string,
        dataType: HiQnetDataType,
        valueHex: string
    ): string {
        let payload = '';
        payload += '0001';                                     // NumParam UWORD
        payload += paramId.padLeft(4);                         // Param_ID UWORD
        payload += dataType.toString(16).padLeft(2);           // DataType UBYTE
        payload += valueHex;                                   // Value
        return payload;
    }
    
    /**
     * Constructs a MultiParamSetPercent payload for a single parameter.
     */
    public static buildMultiParamSetPercentPayload(
        paramId: string,
        valueHex: string
    ): string {
        let payload = '';
        payload += '0001';                                     // NumPARAM UWORD
        payload += paramId.padLeft(4);                         // PARAM_ID UWORD
        payload += valueHex.padLeft(4).substring(0, 4);        // PARAM_Value (1.15 fixed-point)
        return payload;
    }

    /**
     * Constructs a MultiParamSubscribe payload.
     */
    public static buildMultiParamSubscribePayload(
        subscriberAddress: string,
        paramIds: string[]
    ): string {
        let payload = '';
        payload += paramIds.length.toString(16).padLeft(4);

        for (const id of paramIds) {
            payload += id.padLeft(4);                        // Publisher_Param_ID
            payload += '00';                                 // Subscription_Type: 0
            payload += subscriberAddress.padLeft(12);        // Subscriber_Address (6 bytes)
            payload += id.padLeft(4);                        // Subscriber_Param_ID
            payload += '000000';                             // Reserved
            payload += '0032';                               // Sensor_Rate: 50ms
        }

        return payload;
    }

    /**
     * Constructs a MultiParamUnsubscribe payload.
     */
    public static buildMultiParamUnsubscribePayload(
        subscriberAddress: string,
        paramIds: string[]
    ): string {
        let payload = '';
        payload += subscriberAddress.padLeft(12);              // Subscriber Address (HIQNETADDR)
        payload += paramIds.length.toString(16).padLeft(4);    // Num_Subscriptions

        for (const id of paramIds) {
            payload += id.padLeft(4);                          // Publisher_Param_ID
            payload += id.padLeft(4);                          // Subscriber_Param_ID
        }

        return payload;
    }

    public static createFullAddress(deviceAddress: string, virtualDeviceAddress: string, objectId: string): string {
        return deviceAddress.padLeft(4) + virtualDeviceAddress.padLeft(2) + objectId.padLeft(6);
    }
}
