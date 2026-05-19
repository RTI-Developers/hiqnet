class Device {
	private static readonly STD_HEADER_LEN: number = 25;
	private static readonly FLAG_INFORMATION: number = 0x0004;
	private static readonly FLAG_GUARANTEED: number = 0x0020;
	private static readonly FLAG_SESSION: number = 0x0100;
	private static readonly MSGID_DISCO_INFO: string = '0000';
	private static readonly MSGID_GOODBYE: string = '0007';
	private static readonly MSGID_HELLO: string = '0008';
	private static readonly MSGID_PARAM_SET: string = '0100';
	private static readonly MSGID_PARAM_SET_PERCENT: string = '0102';
	private static readonly MSGID_MULTI_PARAM_SUBSCRIBE: string = '010F';

	private readonly _index: number;
	private readonly _logger: Logger;
	private readonly _loggerContext: string;
	private readonly _parameters: Parameter[];
	private readonly _pollingEvent: ScheduledEvent;

	private readonly _protocolVersionHex: string;
	private readonly _hopCountHex: string;
	private readonly _sourceAddressHex: string;          // 12 hex chars (6 bytes)
	private readonly _sourceAddressPrefixHex: string;    // 6 hex chars (Source Device + VD)
	private readonly _deviceAddressPrefixHex: string;    // 6 hex chars (Remote Device + VD)
	private readonly _deviceAddressOnlyHex: string;      // 4 hex chars (Remote Device, for Goodbye payload)

	private _latestConnectionState: ConnectionState | undefined = undefined;
	private _localSessionNumber: number = 0;
	private _remoteSessionNumber: number = 0;
	private _sequenceNumber: number = 1;
	private _rxBufferHex: string = '';

	public readonly Connection: DeviceConnection;
	public Name: string;
	public PollingEventHandle: number;

	public constructor(
		index: number,
		name: string,
		connection: DeviceConnection,
		parameters: Parameter[],
		pollingIntervalSec: number,
		onPollingEventElapsed: (handle: number) => void,
		logger: Logger
	) {
		this._index = index;
		this.Name = name;
		this.Connection = connection;
		this._parameters = parameters;
		this._logger = logger;
		this._loggerContext = 'HiQNet Device (' + name + ')';

		this._protocolVersionHex = Config.Get('ProtocolVersion').cleanHex();
		this._hopCountHex = Config.Get('HopCount').cleanHex();
		this._sourceAddressHex = Config.Get('SourceAddress').cleanHex();
		this._sourceAddressPrefixHex = this._sourceAddressHex.substring(0, 6);

		const deviceAddr = Config.Get('HiQNetDeviceAddress' + index).cleanHex();
		const vdAddr = Config.Get('HiQNetVirtualDeviceAddress' + index).cleanHex();
		this._deviceAddressOnlyHex = deviceAddr;
		this._deviceAddressPrefixHex = (deviceAddr + vdAddr);

		this.initSystemVars();

		this._pollingEvent = new ScheduledEvent(onPollingEventElapsed, 'Periodic', 'Seconds', pollingIntervalSec);
		this._pollingEvent.UseHandleInCallbacks = true;
		this._pollingEvent.Disable();
		this.PollingEventHandle = this._pollingEvent.Handle;

		System.SignalEvent('Initialized' + index);
	}

	public OnCommRx(data: string) {
		// Append new bytes to RX buffer and drain any complete messages.
		this._rxBufferHex += data.toHexByteArray().join('');

		while (this._rxBufferHex.length >= 12) {
			// Need at least 6 bytes to read message length.
			const messageSize = hexToUnsignedInt(this._rxBufferHex.substring(4, 12));
			if (!messageSize || messageSize < Device.STD_HEADER_LEN) {
				// Malformed; discard buffer to recover.
				this._logger.logError('Invalid message size (' + messageSize + ') — flushing RX buffer', this._loggerContext);
				this._rxBufferHex = '';
				return;
			}

			const messageHexLen = messageSize * 2;
			if (this._rxBufferHex.length < messageHexLen) {
				return; // Wait for more bytes.
			}

			const messageHex = this._rxBufferHex.substring(0, messageHexLen);
			this._rxBufferHex = this._rxBufferHex.substring(messageHexLen);
			this.processMessage(messageHex);
		}
	}

	public OnConnectionStateChanged(state: ConnectionState) {
		if (state == this._latestConnectionState) return;
		this._latestConnectionState = state;

		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace('OnConnectionStateChanged -> ' + ConnectionState[state], this._loggerContext);
		}

		switch (state) {
			case ConnectionState.Connected:
				this.setConnectedValue(true);
				System.SignalEvent('Connected' + this._index);
				this._rxBufferHex = '';
				this._sequenceNumber = 1;
				this._remoteSessionNumber = 0;
				this.refreshLocalSessionNumber();
				this.sendHelloQuery();
				this.subscribeAllParameters();
				this._pollingEvent.Enable();
				break;
			case ConnectionState.Disconnected:
				this.setConnectedValue(false);
				System.SignalEvent('Disconnected' + this._index);
				this._pollingEvent.Disable();
				break;
			case ConnectionState.Failed:
				this.setConnectedValue(false);
				System.SignalEvent('ConnectionFailed' + this._index);
				this._pollingEvent.Disable();
				break;
		}
	}

	public OnPollingEventElapsed() {
		// Keep-alive: spec says send DiscoInfo(I) within KAP if no other traffic.
		this.sendDiscoInfoKeepAlive();
	}

	public SetParameter(parameterIndex: number, hexValue: string) {
		hexValue = hexValue.cleanHex();

		if (parameterIndex < 1 || parameterIndex >= this._parameters.length) {
			this._logger.logError('SetParameter: parameterIndex (' + parameterIndex + ') out of range', this._loggerContext);
			return;
		}

		const parameter = this._parameters[parameterIndex];
		if (!parameter || !parameter.IsSetAllowed) {
			this._logger.logError('Parameter not configured to allow set', this._loggerContext);
			return;
		}

		if (parameter.SetMethod == 'Set %') {
			this.sendParamSetPercent(parameter, hexValue);
		} else {
			this.sendParamSet(parameter, hexValue);
		}

		// Echo locally so the UI reflects the change immediately.
		this.updateParameterValueVariable(parameter, hexValue);
	}

	public Shutdown() {
		this._pollingEvent.Disable();
		if (this._latestConnectionState == ConnectionState.Connected) {
			this.sendGoodbye();
		}
		this.Connection.shutdown();
	}

	//#region Outgoing messages

	private sendHelloQuery() {
		// Hello Query: payload = SessionNumber(UWORD) + FlagMask(UWORD). No session extension.
		const destAddress = this._deviceAddressPrefixHex + '000000';
		const payload = this._localSessionNumber.toString(16).padLeft(4) + '01FF';
		const header = this.buildHeader(Device.MSGID_HELLO, destAddress, payload.length / 2, Device.FLAG_GUARANTEED, false);
		this.transmit(header + payload);
	}

	private sendGoodbye() {
		// Goodbye payload = Device Address UWORD
		const destAddress = this._deviceAddressPrefixHex + '000000';
		const payload = this._deviceAddressOnlyHex.padLeft(4);
		const header = this.buildHeader(Device.MSGID_GOODBYE, destAddress, payload.length / 2, Device.FLAG_GUARANTEED, true);
		this.transmit(header + payload);
	}

	private sendDiscoInfoKeepAlive() {
		// Minimal DiscoInfo(I) sent unicast to the device per spec section 8.6 (TCP keep-alive).
		const dest = this._deviceAddressPrefixHex + '000000';
		const serialBlock = '0001' + '00'; // BLOCK: UWORD length=1, 1 dummy byte
		const sourceDevHex = this._sourceAddressHex.substring(0, 4);
		let payload = sourceDevHex;                         // HiQnet Device UWORD
		payload += '00';                                    // Cost UBYTE
		payload += serialBlock;                             // Serial Number BLOCK
		payload += '00004000';                              // Max Message Size ULONG (16384)
		payload += '2710';                                  // Keep Alive Period UWORD (10000ms)
		payload += '01';                                    // NetworkID UBYTE (1 = TCP/IP)
		payload += '000000000000';                          // MAC (6 bytes, zero — unknown)
		payload += '00';                                    // DHCP/AutoIP UBYTE
		payload += '00000000';                              // IP ULONG (unknown)
		payload += '00000000';                              // Subnet ULONG
		payload += '00000000';                              // Gateway ULONG

		const flags = Device.FLAG_GUARANTEED | Device.FLAG_INFORMATION;
		const header = this.buildHeader(Device.MSGID_DISCO_INFO, dest, payload.length / 2, flags, true);
		this.transmit(header + payload);
	}

	private subscribeAllParameters() {
		for (let i = 0; i < this._parameters.length; i++) {
			const p = this._parameters[i];
			if (p && p.IsSubscribeEnabled) {
				this.sendParamSubscribe(p);
			}
		}
	}

	private sendParamSubscribe(parameter: Parameter) {
		const dest = this._deviceAddressPrefixHex + parameter.ObjectAddress;
		const subscriberAddress = this._sourceAddressPrefixHex + parameter.ObjectAddress;

		let payload = '0001';                          // NumSubscriptions UWORD
		payload += parameter.Id;                        // Publisher Param_ID UWORD
		payload += parameter.SubscriptionType;          // Subscription Type UBYTE
		payload += subscriberAddress;                   // Subscriber Address (6 bytes)
		payload += parameter.Id;                        // Subscriber Param_ID UWORD
		payload += '000000';                            // Reserved UBYTE + UWORD
		payload += parameter.SensorRate;                // Sensor Rate UWORD

		const header = this.buildHeader(Device.MSGID_MULTI_PARAM_SUBSCRIBE, dest, payload.length / 2, Device.FLAG_GUARANTEED, true);
		this.transmit(header + payload);
	}

	private sendParamSet(parameter: Parameter, hexValue: string) {
		const dest = this._deviceAddressPrefixHex + parameter.ObjectAddress;
		let payload = '0001';                           // NumParam UWORD
		payload += parameter.Id;                        // Param_ID UWORD
		payload += parameter.DataType;                  // DataType UBYTE
		payload += hexValue;                            // Value
		const header = this.buildHeader(Device.MSGID_PARAM_SET, dest, payload.length / 2, Device.FLAG_GUARANTEED, true);
		this.transmit(header + payload);
	}

	private sendParamSetPercent(parameter: Parameter, hexValueUword: string) {
		const dest = this._deviceAddressPrefixHex + parameter.ObjectAddress;
		const value = hexValueUword.length == 4 ? hexValueUword : hexValueUword.padLeft(4);
		let payload = '0001';                           // NumPARAM UWORD
		payload += parameter.Id;                        // PARAM_ID UWORD
		payload += value;                               // PARAM_Value UWORD (1.15 fixed-point)
		const header = this.buildHeader(Device.MSGID_PARAM_SET_PERCENT, dest, payload.length / 2, Device.FLAG_GUARANTEED, true);
		this.transmit(header + payload);
	}

	private buildHeader(messageId: string, destAddress: string, payloadByteLen: number, flagsBits: number, includeSession: boolean): string {
		let flags = flagsBits;
		let extraBytes = 0;
		let extension = '';

		if (includeSession && this._remoteSessionNumber > 0) {
			flags |= Device.FLAG_SESSION;
			extension = this._remoteSessionNumber.toString(16).padLeft(4);
			extraBytes = 2;
		}

		const headerLen = Device.STD_HEADER_LEN + extraBytes;
		const totalLen = headerLen + payloadByteLen;

		let header = this._protocolVersionHex;
		header += headerLen.toString(16).padLeft(2);
		header += totalLen.toString(16).padLeft(8);
		header += this._sourceAddressHex;
		header += destAddress;
		header += messageId;
		header += flags.toString(16).padLeft(4);
		header += this._hopCountHex;
		header += this._sequenceNumber.toString(16).padLeft(4);
		header += extension;

		this.incrementSequenceNumber();
		return header;
	}

	private transmit(messageHex: string) {
		const clean = messageHex.cleanHex();
		if (this._logger.IsTraceEnabled) this._logger.logTrace('TX: ' + clean, this._loggerContext);
		const bytes = hexToBytes(clean);
		const raw = String.fromCharCode.apply(null, bytes);
		this.Connection.sendRawCommand(raw);
	}

	private incrementSequenceNumber() {
		this._sequenceNumber++;
		if (this._sequenceNumber > 0xFFFF) this._sequenceNumber = 1;
	}

	private refreshLocalSessionNumber() {
		// Per spec: random 1-65535, must not repeat across reboots.
		this._localSessionNumber = System.GetRandomInteger(1, 65535);
	}

	//#endregion

	//#region Incoming message processing

	private processMessage(messageHex: string) {
		if (messageHex.length < Device.STD_HEADER_LEN * 2) return;

		const protocolVersionHex = messageHex.substring(0, 2);
		if (protocolVersionHex != this._protocolVersionHex) {
			this._logger.logError('Unexpected protocol version [' + protocolVersionHex + ']', this._loggerContext);
			return;
		}

		const headerLenBytes = hexToUnsignedInt(messageHex.substring(2, 4));
		const flags = hexToUnsignedInt(messageHex.substring(40, 44));
		const messageIdHex = messageHex.substring(36, 40).toLowerCase();
		const payloadStart = headerLenBytes * 2;
		const payload = messageHex.substring(payloadStart);

		// If session extension present, the device session number is the last 2 bytes of header.
		if ((flags & Device.FLAG_SESSION) != 0 && headerLenBytes >= Device.STD_HEADER_LEN + 2) {
			const sessExt = messageHex.substring(payloadStart - 4, payloadStart);
			const sess = hexToUnsignedInt(sessExt);
			if (sess > 0) this._remoteSessionNumber = sess;
		}

		// Strip error extension from payload if present (FLAG bit 3).
		let effectivePayload = payload;
		if ((flags & 0x0008) != 0) {
			// Error code (UWORD) + Error string (STRING: UWORD byte_count + UTF-16 bytes)
			if (effectivePayload.length >= 4) {
				const errCode = hexToUnsignedInt(effectivePayload.substring(0, 4));
				const strBytes = hexToUnsignedInt(effectivePayload.substring(4, 8));
				this._logger.logError('Device returned error code 0x' + errCode.toString(16) + ' (msgId=' + messageIdHex + ')', this._loggerContext);
				effectivePayload = effectivePayload.substring(8 + strBytes * 2);
			}
		}

		switch (messageIdHex) {
			case '0000': /* DiscoInfo */
				// Keep-alive or peer announcement; nothing to do here.
				break;
			case '0007': /* Goodbye */
				if (this._logger.IsTraceEnabled) this._logger.logTrace('Received Goodbye from device', this._loggerContext);
				this._remoteSessionNumber = 0;
				break;
			case '0008': /* Hello (Info) */
				this.handleHelloInfo(effectivePayload);
				break;
			case '0100': /* MultiParamSet — also valid as subscription update */
				this.handleMultiParamSet(effectivePayload, null);
				break;
			case '0101': /* MultiObjectParamSet */
				this.handleMultiObjectParamSet(effectivePayload);
				break;
			case '0103': /* MultiParamGet response (INFO flag set) */
				if ((flags & Device.FLAG_INFORMATION) != 0) {
					this.handleMultiParamSet(effectivePayload, null);
				}
				break;
			default:
				if (this._logger.IsTraceEnabled) this._logger.logTrace('Unhandled message id 0x' + messageIdHex, this._loggerContext);
				break;
		}
	}

	private handleHelloInfo(payload: string) {
		if (payload.length < 4) return;
		// Per spec the device's session number is also in the payload (UWORD).
		const sess = hexToUnsignedInt(payload.substring(0, 4));
		if (sess > 0) this._remoteSessionNumber = sess;
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace('Hello Info: remote session = ' + this._remoteSessionNumber, this._loggerContext);
		}
	}

	private handleMultiObjectParamSet(payload: string) {
		if (payload.length < 4) return;
		let pos = 0;
		const numObjects = hexToUnsignedInt(payload.substring(pos, pos + 4));
		pos += 4;

		for (let o = 0; o < numObjects; o++) {
			if (payload.length < pos + 8) return;
			// Object_Dest = VD(1) + Object(3) = 4 bytes = 8 hex chars.
			// The configured ObjectAddress is the 3-byte object portion.
			const objectAddress = payload.substring(pos + 2, pos + 8);
			pos += 8;

			pos = this.consumeMultiParamSet(payload, pos, objectAddress);
			if (pos < 0) return;
		}
	}

	private handleMultiParamSet(payload: string, objectAddressOverride: string | null) {
		this.consumeMultiParamSet(payload, 0, objectAddressOverride);
	}

	// Consumes one MultiParam block beginning at `pos` in `payload`.
	// If objectAddress is null, any parameter with the matching ID matches.
	// Returns new position after the block or -1 on parse failure.
	private consumeMultiParamSet(payload: string, pos: number, objectAddress: string | null): number {
		if (payload.length < pos + 4) return -1;
		const numParams = hexToUnsignedInt(payload.substring(pos, pos + 4));
		pos += 4;

		for (let p = 0; p < numParams; p++) {
			if (payload.length < pos + 6) return -1;
			const paramId = payload.substring(pos, pos + 4).toLowerCase();
			const dataType = hexToUnsignedInt(payload.substring(pos + 4, pos + 6));
			pos += 6;

			const valueHexChars = hexCharsForDataType(dataType);
			let valueHex: string;
			let consumed: number;

			if (valueHexChars > 0) {
				if (payload.length < pos + valueHexChars) return -1;
				valueHex = payload.substring(pos, pos + valueHexChars);
				consumed = valueHexChars;
			} else if (dataType == HQ_BLOCK || dataType == HQ_STRING) {
				if (payload.length < pos + 4) return -1;
				const blockBytes = hexToUnsignedInt(payload.substring(pos, pos + 4));
				const blockHex = blockBytes * 2;
				if (payload.length < pos + 4 + blockHex) return -1;
				valueHex = payload.substring(pos + 4, pos + 4 + blockHex);
				consumed = 4 + blockHex;
			} else {
				this._logger.logError('Unknown data type ' + dataType + ' in response — stopping parse', this._loggerContext);
				return -1;
			}
			pos += consumed;

			const parameter = this.findMatchingParameter(objectAddress, paramId);
			if (!parameter) {
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace('No matching parameter for obj=' + (objectAddress || '*') + ' id=' + paramId, this._loggerContext);
				}
				continue;
			}

			this.applyDecodedValue(parameter, dataType, valueHex);
		}

		return pos;
	}

	private findMatchingParameter(objectAddress: string | null, paramId: string): Parameter | null {
		const normalizedObj = objectAddress ? objectAddress.toLowerCase() : null;
		for (let i = 0; i < this._parameters.length; i++) {
			const p = this._parameters[i];
			if (!p) continue;
			if (p.Id.toLowerCase() != paramId) continue;
			if (normalizedObj && p.ObjectAddress.toLowerCase() != normalizedObj) continue;
			return p;
		}
		return null;
	}

	private applyDecodedValue(parameter: Parameter, dataType: number, valueHex: string) {
		switch (parameter.VariableType) {
			case 'Boolean': {
				const decoded = decodeHiqnetValueHex(dataType, valueHex);
				SystemVars.Write('ParameterBoolValue' + this._index + '_' + parameter.Index, decoded != 0, 'BOOLEAN');
				break;
			}
			case 'Integer': {
				let n: number;
				if (dataType == HQ_FLOAT32) {
					// Round to int — variable is integer.
					n = Math.round(hexToFloat32(valueHex));
				} else {
					n = decodeHiqnetValueHex(dataType, valueHex);
				}
				SystemVars.Write('ParameterIntValue' + this._index + '_' + parameter.Index, n);
				break;
			}
			case 'String': {
				const str = this.decodeStringValue(dataType, valueHex);
				SystemVars.Write('ParameterStringValue' + this._index + '_' + parameter.Index, str);
				break;
			}
		}
	}

	private decodeStringValue(dataType: number, valueHex: string): string {
		if (dataType == HQ_STRING) {
			// HiQnet STRING is UTF-16BE with NULL terminator. Read pairs of bytes as chars.
			const out: string[] = [];
			for (let i = 0; i + 4 <= valueHex.length; i += 4) {
				const code = hexToUnsignedInt(valueHex.substring(i, i + 4));
				if (code == 0) break;
				out.push(String.fromCharCode(code));
			}
			return out.join('');
		}
		// For non-STRING types, hand back the numeric value as a decimal string.
		const n = decodeHiqnetValueHex(dataType, valueHex);
		return n.toString();
	}

	//#endregion

	//#region SystemVars helpers

	private initSystemVars() {
		SystemVars.Write('Connected' + this._index, false, 'BOOLEAN');
		for (let i = 0; i < this._parameters.length; i++) {
			const p = this._parameters[i];
			if (!p) continue;
			switch (p.VariableType) {
				case 'Boolean':
					SystemVars.Write('ParameterBoolValue' + this._index + '_' + p.Index, false, 'BOOLEAN');
					break;
				case 'Integer':
					SystemVars.Write('ParameterIntValue' + this._index + '_' + p.Index, 0);
					break;
				case 'String':
					SystemVars.Write('ParameterStringValue' + this._index + '_' + p.Index, '');
					break;
			}
		}
	}

	private setConnectedValue(value: boolean) {
		SystemVars.Write('Connected' + this._index, value, 'BOOLEAN');
	}

	private updateParameterValueVariable(parameter: Parameter, hexValue: string) {
		// Used for echoing controller-initiated Set values back into SystemVars.
		// The hexValue is interpreted via the parameter's configured DataType.
		const dataType = hexToUnsignedInt(parameter.DataType);
		this.applyDecodedValue(parameter, dataType, hexValue);
	}

	//#endregion
}
