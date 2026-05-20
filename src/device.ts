class Device {
	private static readonly STD_HEADER_LEN: number = 25;
	private static readonly FLAG_INFORMATION: number = 0x0004;
	private static readonly FLAG_GUARANTEED: number = 0x0020;
	private static readonly MSGID_DISCO_INFO: string = '0000';
	private static readonly MSGID_GOODBYE: string = '0007';
	private static readonly MSGID_PARAM_SET: string = '0100';
	private static readonly MSGID_PARAM_SET_PERCENT: string = '0102';
	private static readonly MSGID_PARAM_GET: string = '0103';
	private static readonly MSGID_MULTI_PARAM_SUBSCRIBE: string = '010f';

	private readonly _index: number;
	private readonly _logger: Logger;
	private readonly _loggerContext: string;
	private readonly _parameters: Parameter[];
	private readonly _pollingEvent: ScheduledEvent;

	private readonly _protocolVersionHex: string;
	private readonly _hopCountHex: string;
	private readonly _sourceAddressHex: string;          // 12 hex chars (6 bytes)
	private readonly _deviceAddressPrefixHex: string;    // 6 hex chars (Remote Device + VD)
	private readonly _deviceAddressOnlyHex: string;      // 4 hex chars (Remote Device, for Goodbye payload)

	private _latestConnectionState: ConnectionState | undefined = undefined;
	private _rxBufferHex: string = '';
	private _subscriptionsSent: boolean = false;
	private _controllerIpHex: string = '00000000';

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
		// Strip VD-OBJECT: a controller node has no virtual devices; address = NODE + 0x00000000.
		const configAddr = Config.Get('SourceAddress').cleanHex();
		this._sourceAddressHex = configAddr.substring(0, 4) + '00000000';

		const deviceAddr = Config.Get('HiQNetDeviceAddress' + index).cleanHex();
		const vdAddr = Config.Get('HiQNetVirtualDeviceAddress' + index).cleanHex();
		this._deviceAddressOnlyHex = deviceAddr;
		this._deviceAddressPrefixHex = (deviceAddr + vdAddr);

		this.refreshControllerIp();

		this.initSystemVars();

		this._pollingEvent = new ScheduledEvent(onPollingEventElapsed, 'Periodic', 'Seconds', pollingIntervalSec);
		this._pollingEvent.UseHandleInCallbacks = true;
		this._pollingEvent.Disable();
		this.PollingEventHandle = this._pollingEvent.Handle;

		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'Constructed:'
				+ ' srcAddr=' + this._sourceAddressHex.toUpperCase()
				+ ' devicePrefix=' + this._deviceAddressPrefixHex.toUpperCase()
				+ ' controllerIp=' + this.hexToIpString(this._controllerIpHex)
				+ ' protocolVer=0x' + this._protocolVersionHex.toUpperCase()
				+ ' hopCount=0x' + this._hopCountHex.toUpperCase()
				+ ' pollIntervalSec=' + pollingIntervalSec
				+ ' parameterCount=' + parameters.length,
				this._loggerContext
			);
		}

		System.SignalEvent('Initialized' + index);
	}

	public OnCommRx(data: string) {
		const incoming = data.toHexByteArray().join('');
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'RX raw ' + (incoming.length / 2) + ' byte(s): ' + incoming.toUpperCase(),
				this._loggerContext
			);
		}

		this._rxBufferHex += incoming;

		while (this._rxBufferHex.length >= 12) {
			// Need at least 6 bytes to read message length field (bytes 2-5).
			const messageSize = hexToUnsignedInt(this._rxBufferHex.substring(4, 12));
			if (!messageSize || messageSize < Device.STD_HEADER_LEN) {
				this._logger.logError(
					'Invalid message size (' + messageSize + ') in RX buffer -- flushing.'
					+ ' Buffer head: ' + this._rxBufferHex.substring(0, 20).toUpperCase(),
					this._loggerContext
				);
				this._rxBufferHex = '';
				return;
			}

			const messageHexLen = messageSize * 2;
			if (this._rxBufferHex.length < messageHexLen) {
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace(
						'Partial message: have ' + (this._rxBufferHex.length / 2)
						+ ' byte(s), need ' + messageSize + ' -- waiting for more data.',
						this._loggerContext
					);
				}
				return;
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
			this._logger.logTrace('Connection state -> ' + ConnectionState[state], this._loggerContext);
		}

		switch (state) {
			case ConnectionState.Connected:
				this.setConnectedValue(true);
				System.SignalEvent('Connected' + this._index);
				this._rxBufferHex = '';
				this._subscriptionsSent = false;
				this._logger.logInfo('Connected -- sending Discovery.', this._loggerContext);
				this.sendDiscoveryQuery();
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
		// Fallback: if Discovery(I) was never received, subscribe now so we don't wait indefinitely.
		if (!this._subscriptionsSent) {
			this._logger.logInfo(
				'Discovery response not received before first poll tick -- sending subscriptions now (fallback).',
				this._loggerContext
			);
			this.sendParameterSubscriptions();
			this._subscriptionsSent = true;
		}

		// Re-check our IP on each poll until a valid address is available (SDK: may be 0.0.0.0 at startup).
		if (this._controllerIpHex === '00000000') {
			this.refreshControllerIp();
		}

		// Keep-alive: spec s.8.6 -- send DiscoInfo(I) if no other message sent within KAP.
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

	private sendDiscoveryQuery() {
		const dest = this._deviceAddressPrefixHex + '000000';
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace('TX Discovery query to ' + dest.toUpperCase() + '.', this._loggerContext);
		}
		const payload = this.buildDiscoInfoPayload();
		const header = this.buildHeader(Device.MSGID_DISCO_INFO, dest, payload.length / 2, Device.FLAG_GUARANTEED, false);
		this.transmit(header + payload);
	}

	private sendGoodbye() {
		// Goodbye payload = Device Address UWORD.
		const destAddress = this._deviceAddressPrefixHex + '000000';
		const payload = this._deviceAddressOnlyHex.padLeft(4);
		this._logger.logInfo('TX Goodbye to device.', this._loggerContext);
		const header = this.buildHeader(Device.MSGID_GOODBYE, destAddress, payload.length / 2, Device.FLAG_GUARANTEED, true);
		this.transmit(header + payload);
	}

	private sendDiscoInfoKeepAlive() {
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace('TX DiscoInfo(I) keep-alive.', this._loggerContext);
		}
		this.sendDiscoInfo(this._deviceAddressPrefixHex + '000000');
	}

	private buildDiscoInfoPayload(): string {
		const serialBlock = '0010' + '00000000000000000000000000000000';
		const sourceDevHex = this._sourceAddressHex.substring(0, 4);
		let payload = sourceDevHex;
		payload += '01';
		payload += serialBlock;
		payload += '00100000';
		payload += '2710';
		payload += '01';
		payload += '000000000000';
		payload += '00';
		payload += this._controllerIpHex;
		payload += 'ffffffff';
		payload += 'ffffffff';
		return payload;
	}

	private sendDiscoInfo(dest: string) {
		const payload = this.buildDiscoInfoPayload();
		const flags = Device.FLAG_GUARANTEED | Device.FLAG_INFORMATION;
		const header = this.buildHeader(Device.MSGID_DISCO_INFO, dest, payload.length / 2, flags, true);
		this.transmit(header + payload);
	}


	private handleDiscoInfo(flags: number, sourceAddress: string, payload: string) {
		const isInfo = (flags & Device.FLAG_INFORMATION) != 0;

		// Parse the sender's IP from the DiscoInfo payload for logging.
		// Structure: Device(UWORD=4) + Cost(UBYTE=2) + Serial(BLOCK: UWORD len + data) +
		//            MaxMsgSize(ULONG=8) + KAP(UWORD=4) + NetworkID(UBYTE=2) + NetworkInfo
		let senderIp = '';
		if (payload.length >= 10) {
			const serialLen = hexToUnsignedInt(payload.substring(6, 10));
			const networkIdOffset = 10 + serialLen * 2 + 8 + 4;
			if (payload.length >= networkIdOffset + 2) {
				const networkId = hexToUnsignedInt(payload.substring(networkIdOffset, networkIdOffset + 2));
				if (networkId === 1) {
					const ipOffset = networkIdOffset + 2 + 12 + 2;
					if (payload.length >= ipOffset + 8) {
						senderIp = this.hexToIpString(payload.substring(ipOffset, ipOffset + 8));
					}
				}
			}
		}

		const sourceNode = sourceAddress.substring(0, 4).toLowerCase();
		const deviceNode = this._deviceAddressOnlyHex.padLeft(4).toLowerCase();

		if (!isInfo) {
			// Discovery(Q): device is discovering us so it can route subscription pushes back.
			// Respond with Discovery(I) so it can populate its routing table with our address.
			this._logger.logInfo(
				'Discovery(Q) from ' + sourceAddress.toUpperCase()
				+ (senderIp ? ' (' + senderIp + ')' : '')
				+ ' -- responding with Discovery(I).',
				this._loggerContext
			);
			this.sendDiscoInfo(sourceAddress);
		} else if (sourceNode === deviceNode && !this._subscriptionsSent) {
			// Discovery(I) from our target device acknowledging our query -- subscribe now.
			this._logger.logInfo(
				'Discovery(I) from device ' + sourceAddress.toUpperCase()
				+ (senderIp ? ' (' + senderIp + ')' : '')
				+ ' -- sending subscriptions.',
				this._loggerContext
			);
			this.sendParameterSubscriptions();
			this._subscriptionsSent = true;
		} else if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'Discovery(I) from ' + sourceAddress.toUpperCase()
				+ (senderIp ? ' (' + senderIp + ')' : '')
				+ (this._subscriptionsSent ? ' (already subscribed)' : ' (not our device)'),
				this._loggerContext
			);
		}
	}

	private refreshControllerIp() {
		const resolved = this.parseIpToHex(System.IPAddress);

		if (resolved !== this._controllerIpHex) {
			this._controllerIpHex = resolved;
			this._logger.logInfo(
				'Controller IP resolved to ' + this.hexToIpString(this._controllerIpHex),
				this._loggerContext
			);
		}
	}

	private parseIpToHex(ipStr: string): string {
		if (!ipStr) return '00000000';
		const parts = ipStr.split('.');
		if (parts.length !== 4) return '00000000';
		let hex = '';
		for (let i = 0; i < 4; i++) {
			const n = parseInt(parts[i], 10);
			if (isNaN(n) || n < 0 || n > 255) return '00000000';
			hex += n.toString(16).padLeft(2);
		}
		return hex;
	}

	private hexToIpString(hex: string): string {
		if (!hex || hex.length < 8) return '';
		const parts: string[] = [];
		for (let i = 0; i < 8; i += 2) {
			parts.push(hexToUnsignedInt(hex.substring(i, i + 2)).toString(10));
		}
		return parts.join('.');
	}

	private sendParameterSubscriptions() {
		let count = 0;
		for (let i = 0; i < this._parameters.length; i++) {
			const p = this._parameters[i];
			if (!p || !p.IsSubscribeEnabled) continue;
			this.sendMultiParamSubscribe(p);
			this.sendParamGet(p);
			count++;
		}
		this._logger.logInfo('Sent MultiParamSubscribe + MultiParamGet for ' + count + ' parameter(s).', this._loggerContext);
	}

	private sendMultiParamSubscribe(parameter: Parameter) {
		const dest = this._deviceAddressPrefixHex + parameter.ObjectAddress;
		let payload = '0001';                  // NO OF SUBSCRIPTIONS: 1
		payload += parameter.Id;               // PUBLISHER PARAM ID
		payload += '00';                       // SUBSCRIPTION TYPE: 0
		payload += this._sourceAddressHex;     // SUBSCRIBER ADDRESS (NODE + VD-OBJECT)
		payload += parameter.Id;               // SUBSCRIBER PARAM ID
		payload += '00';                       // Reserved
		payload += '0000';                     // Reserved
		payload += '0032';                     // SENSOR RATE: 50ms
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'TX MultiParamSubscribe "' + parameter.Name
				+ '" obj=0x' + parameter.ObjectAddress.toUpperCase()
				+ ' paramId=0x' + parameter.Id.toUpperCase(),
				this._loggerContext
			);
		}
		const header = this.buildHeader(Device.MSGID_MULTI_PARAM_SUBSCRIBE, dest, payload.length / 2, Device.FLAG_GUARANTEED, false);
		this.transmit(header + payload);
	}

	private sendParamGet(parameter: Parameter) {
		const dest = this._deviceAddressPrefixHex + parameter.ObjectAddress;
		let payload = '0001';      // PARAMETER COUNT: 1
		payload += parameter.Id;   // PARAMETER ID
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'TX MultiParamGet "' + parameter.Name
				+ '" obj=0x' + parameter.ObjectAddress.toUpperCase()
				+ ' paramId=0x' + parameter.Id.toUpperCase(),
				this._loggerContext
			);
		}
		const header = this.buildHeader(Device.MSGID_PARAM_GET, dest, payload.length / 2, Device.FLAG_GUARANTEED, false);
		this.transmit(header + payload);
	}

	private sendParamSet(parameter: Parameter, hexValue: string) {
		const dest = this._deviceAddressPrefixHex + parameter.ObjectAddress;
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'TX MultiParamSet "' + parameter.Name + '"'
				+ ' paramId=0x' + parameter.Id.toUpperCase()
				+ ' dataType=' + hexToUnsignedInt(parameter.DataType)
				+ ' value=0x' + hexValue.toUpperCase(),
				this._loggerContext
			);
		}
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
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'TX ParamSetPercent "' + parameter.Name + '"'
				+ ' paramId=0x' + parameter.Id.toUpperCase()
				+ ' value=0x' + value.toUpperCase()
				+ ' (' + hexToPercent115(value).toFixed(1) + '%)',
				this._loggerContext
			);
		}
		let payload = '0001';                           // NumPARAM UWORD
		payload += parameter.Id;                        // PARAM_ID UWORD
		payload += value;                               // PARAM_Value UWORD (1.15 fixed-point)
		const header = this.buildHeader(Device.MSGID_PARAM_SET_PERCENT, dest, payload.length / 2, Device.FLAG_GUARANTEED, true);
		this.transmit(header + payload);
	}

	private buildHeader(messageId: string, destAddress: string, payloadByteLen: number, flagsBits: number, _unused: boolean, hopHex?: string): string {
		const totalLen = Device.STD_HEADER_LEN + payloadByteLen;

		let header = this._protocolVersionHex;
		header += Device.STD_HEADER_LEN.toString(16).padLeft(2);
		header += totalLen.toString(16).padLeft(8);
		header += this._sourceAddressHex;
		header += destAddress;
		header += messageId;
		header += flagsBits.toString(16).padLeft(4);
		header += hopHex !== undefined ? hopHex : this._hopCountHex;
		header += '0000';

		return header;
	}

	private transmit(messageHex: string) {
		const clean = messageHex.cleanHex();
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace('TX ' + (clean.length / 2) + ' byte(s): ' + clean.toUpperCase(), this._loggerContext);
		}
		const bytes = hexToBytes(clean);
		const raw = String.fromCharCode.apply(null, bytes);
		this.Connection.sendRawCommand(raw);
	}



	//#endregion

	//#region Incoming message processing

	private processMessage(messageHex: string) {
		if (messageHex.length < Device.STD_HEADER_LEN * 2) return;

		const protocolVersionHex = messageHex.substring(0, 2);
		if (protocolVersionHex != this._protocolVersionHex) {
			this._logger.logError(
				'Unexpected protocol version 0x' + protocolVersionHex.toUpperCase()
				+ ' (expected 0x' + this._protocolVersionHex.toUpperCase() + ') -- discarding.',
				this._loggerContext
			);
			return;
		}

		const headerLenBytes = hexToUnsignedInt(messageHex.substring(2, 4));
		const totalLenBytes  = hexToUnsignedInt(messageHex.substring(4, 12));
		const sourceAddress  = messageHex.substring(12, 24);
		const messageIdHex   = messageHex.substring(36, 40).toLowerCase();
		const flags          = hexToUnsignedInt(messageHex.substring(40, 44));
		const seqNum         = hexToUnsignedInt(messageHex.substring(46, 50));
		const payloadStart   = headerLenBytes * 2;
		const payload        = messageHex.substring(payloadStart);

		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'RX msgId=0x' + messageIdHex.toUpperCase()
				+ ' flags=0x' + flags.toString(16).padLeft(4).toUpperCase()
				+ ' headerLen=' + headerLenBytes
				+ ' totalLen=' + totalLenBytes
				+ ' src=' + sourceAddress.toUpperCase()
				+ ' seq=' + seqNum
				+ ' payloadBytes=' + (payload.length / 2),
				this._loggerContext
			);
		}

		// Parse and log any error extension (FLAGS bit 3).
		let effectivePayload = payload;
		if ((flags & 0x0008) != 0) {
			if (effectivePayload.length >= 8) {
				const errCode      = hexToUnsignedInt(effectivePayload.substring(0, 4));
				const strByteCount = hexToUnsignedInt(effectivePayload.substring(4, 8));
				let errStr = '';
				const strData = effectivePayload.substring(8, 8 + strByteCount * 2);
				for (let i = 0; i + 4 <= strData.length; i += 4) {
					const code = hexToUnsignedInt(strData.substring(i, i + 4));
					if (code === 0) break;
					errStr += String.fromCharCode(code);
				}
				this._logger.logError(
					'Device error: code=0x' + errCode.toString(16).padLeft(4).toUpperCase()
					+ ' msgId=0x' + messageIdHex.toUpperCase()
					+ (errStr ? ' message="' + errStr + '"' : ' (no error string)'),
					this._loggerContext
				);
				effectivePayload = effectivePayload.substring(8 + strByteCount * 2);
			} else {
				this._logger.logError(
					'Error flag set but payload too short to parse (msgId=0x' + messageIdHex.toUpperCase() + ').',
					this._loggerContext
				);
			}
		}

		switch (messageIdHex) {
			case '0000': /* Discovery */
				this.handleDiscoInfo(flags, sourceAddress, effectivePayload);
				break;
			case '0007': /* Goodbye */
				this._logger.logInfo('Received Goodbye from device.', this._loggerContext);
				break;
			case '0008': /* Hello -- operating session-less; ignore */
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace('Received Hello from device (ignored -- session-less mode).', this._loggerContext);
				}
				break;
			case '0100': /* MultiParamSet -- subscription push notification or get response */
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace(
						'RX MultiParamSet (0x0100) flags=0x' + flags.toString(16).padLeft(4).toUpperCase()
						+ ' src=' + sourceAddress.toUpperCase(),
						this._loggerContext
					);
				}
				// Extract object address from source VD-OBJECT (bytes 3-5 of source address).
				// Avoids false matches when multiple parameters share the same param ID.
				{
					const srcObj = sourceAddress.substring(6, 12);
					this.handleMultiParamSet(effectivePayload, srcObj !== '000000' ? srcObj : null);
				}
				break;
			case '0101': /* MultiObjectParamSet -- subscription push notification */
				this._logger.logInfo(
					'RX MultiObjectParamSet (0x0101) flags=0x' + flags.toString(16).padLeft(4).toUpperCase()
					+ ' src=' + sourceAddress.toUpperCase()
					+ ' bytes=' + (effectivePayload.length / 2),
					this._loggerContext
				);
				this.handleMultiObjectParamSet(effectivePayload);
				break;
			case '0103': /* MultiParamGet response (INFO flag set) */
				if ((flags & Device.FLAG_INFORMATION) != 0) {
					if (this._logger.IsTraceEnabled) {
						this._logger.logTrace('Received MultiParamGet response (0x0103).', this._loggerContext);
					}
					const srcObj103 = sourceAddress.substring(6, 12);
					this.handleMultiParamSet(effectivePayload, srcObj103 !== '000000' ? srcObj103 : null);
				}
				break;
			default:
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace('Unhandled message 0x' + messageIdHex.toUpperCase() + '.', this._loggerContext);
				}
				break;
		}
	}


	private handleMultiObjectParamSet(payload: string) {
		if (payload.length < 4) {
			this._logger.logError('MultiObjectParamSet payload too short.', this._loggerContext);
			return;
		}
		let pos = 0;
		const numObjects = hexToUnsignedInt(payload.substring(pos, pos + 4));
		pos += 4;

		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace('MultiObjectParamSet: ' + numObjects + ' object(s).', this._loggerContext);
		}

		for (let o = 0; o < numObjects; o++) {
			if (payload.length < pos + 8) {
				this._logger.logError(
					'MultiObjectParamSet: payload truncated at object ' + o + '.',
					this._loggerContext
				);
				return;
			}
			// Object_Dest is ULONG: VD(1 byte) + Object(3 bytes) = 4 bytes = 8 hex chars.
			const vdAndObject   = payload.substring(pos, pos + 8);
			const objectAddress = payload.substring(pos + 2, pos + 8);
			pos += 8;

			if (this._logger.IsTraceEnabled) {
				this._logger.logTrace(
					'  Object[' + o + ']: vd+obj=0x' + vdAndObject.toUpperCase()
					+ ' (objAddr=0x' + objectAddress.toUpperCase() + ')',
					this._loggerContext
				);
			}

			pos = this.consumeMultiParamBlock(payload, pos, objectAddress);
			if (pos < 0) {
				this._logger.logError(
					'MultiObjectParamSet: parse failure at object ' + o + '.',
					this._loggerContext
				);
				return;
			}
		}
	}

	private handleMultiParamSet(payload: string, objectAddressOverride: string | null) {
		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'handleMultiParamSet: objFilter=' + (objectAddressOverride ? '0x' + objectAddressOverride.toUpperCase() : '*'),
				this._loggerContext
			);
		}
		this.consumeMultiParamBlock(payload, 0, objectAddressOverride);
	}

	// Parses one NumParams + param-value block beginning at `pos` inside `payload`.
	// objectAddress: if non-null, only parameters whose ObjectAddress matches are updated.
	// Returns the new buffer position, or -1 on parse failure.
	private consumeMultiParamBlock(payload: string, pos: number, objectAddress: string | null): number {
		if (payload.length < pos + 4) return -1;
		const numParams = hexToUnsignedInt(payload.substring(pos, pos + 4));
		pos += 4;

		if (this._logger.IsTraceEnabled) {
			this._logger.logTrace(
				'  ' + numParams + ' param(s) for obj=' + (objectAddress ? '0x' + objectAddress.toUpperCase() : '*'),
				this._loggerContext
			);
		}

		for (let p = 0; p < numParams; p++) {
			if (payload.length < pos + 6) {
				this._logger.logError('Param block truncated at param index ' + p + '.', this._loggerContext);
				return -1;
			}
			const paramId  = payload.substring(pos, pos + 4).toLowerCase();
			const dataType = hexToUnsignedInt(payload.substring(pos + 4, pos + 6));
			pos += 6;

			const valueHexChars = hexCharsForDataType(dataType);
			let valueHex: string;
			let consumed: number;

			if (valueHexChars > 0) {
				if (payload.length < pos + valueHexChars) {
					this._logger.logError(
						'Fixed-width value truncated for param 0x' + paramId.toUpperCase()
						+ ' (need ' + valueHexChars + ' chars, have ' + (payload.length - pos) + ').',
						this._loggerContext
					);
					return -1;
				}
				valueHex = payload.substring(pos, pos + valueHexChars);
				consumed = valueHexChars;
			} else if (dataType == HQ_BLOCK || dataType == HQ_STRING) {
				if (payload.length < pos + 4) {
					this._logger.logError('Variable-length size field truncated.', this._loggerContext);
					return -1;
				}
				const blockBytes = hexToUnsignedInt(payload.substring(pos, pos + 4));
				const blockHex   = blockBytes * 2;
				if (payload.length < pos + 4 + blockHex) {
					this._logger.logError(
						'Variable-length data truncated for param 0x' + paramId.toUpperCase()
						+ ' (declared ' + blockBytes + ' bytes, only ' + ((payload.length - pos - 4) / 2) + ' available).',
						this._loggerContext
					);
					return -1;
				}
				valueHex = payload.substring(pos + 4, pos + 4 + blockHex);
				consumed = 4 + blockHex;
			} else {
				this._logger.logError(
					'Unknown data type ' + dataType + ' for param 0x' + paramId.toUpperCase() + ' -- stopping parse.',
					this._loggerContext
				);
				return -1;
			}
			pos += consumed;

			if (this._logger.IsTraceEnabled) {
				this._logger.logTrace(
					'    Param id=0x' + paramId.toUpperCase()
					+ ' dataType=' + dataType
					+ ' rawValue=0x' + valueHex.toUpperCase(),
					this._loggerContext
				);
			}

			const parameter = this.findMatchingParameter(objectAddress, paramId);
			if (!parameter) {
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace(
						'    No configured parameter for obj='
						+ (objectAddress ? '0x' + objectAddress.toUpperCase() : '*')
						+ ' id=0x' + paramId.toUpperCase() + ' -- skipping.',
						this._loggerContext
					);
				}
				continue;
			}

			if (this._logger.IsTraceEnabled) {
				this._logger.logTrace('    Matched to "' + parameter.Name + '".', this._loggerContext);
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
				const boolVal = decoded != 0;
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace(
						'Update "' + parameter.Name + '" -> Boolean ' + boolVal
						+ ' (raw=0x' + valueHex.toUpperCase() + ')',
						this._loggerContext
					);
				}
				SystemVars.Write('ParameterBoolValue' + this._index + '_' + parameter.Index, boolVal, 'BOOLEAN');
				break;
			}
			case 'Integer': {
				let n: number;
				if (dataType == HQ_FLOAT32) {
					n = Math.round(hexToFloat32(valueHex));
				} else {
					n = decodeHiqnetValueHex(dataType, valueHex);
				}
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace(
						'Update "' + parameter.Name + '" -> Integer ' + n
						+ ' (raw=0x' + valueHex.toUpperCase() + ')',
						this._loggerContext
					);
				}
				SystemVars.Write('ParameterIntValue' + this._index + '_' + parameter.Index, n);
				break;
			}
			case 'String': {
				const str = this.decodeStringValue(dataType, valueHex);
				if (this._logger.IsTraceEnabled) {
					this._logger.logTrace(
						'Update "' + parameter.Name + '" -> String "' + str + '"'
						+ ' (raw=0x' + valueHex.toUpperCase() + ')',
						this._loggerContext
					);
				}
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
		// For non-STRING types, return the numeric value as a decimal string.
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
		const dataType = hexToUnsignedInt(parameter.DataType);
		this.applyDecodedValue(parameter, dataType, hexValue);
	}

	//#endregion
}
