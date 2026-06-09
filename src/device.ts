class Device {
	private readonly _deviceAddress: string;      		 // 4 hex chars
	private readonly _index: number;
	private readonly _logger: Logger;
	private readonly _loggerContext: string;
	private readonly _parameters: Parameter[];
	private readonly _pollingEvent: ScheduledEvent;
	private readonly _protocolVersionHex: string;
	private readonly _sourceDeviceAddress: string;       // 4 hex chars
	private readonly _sourceMacAddress: string;       	 // 12 hex chars
	private readonly _sourceSerialNumber: string;        // 32 hex chars
	private readonly _virtualDeviceAddress: string;      // 2 hex chars

	private _latestConnectionState: ConnectionState | undefined = undefined;
	private _rxBufferHex: string = '';
	private _subscriptionsSent: boolean = false;
	private _hasSubscribed: boolean = false;
	private _controllerIpHex: string = '00000000';
	private _controllerNetMask: string = '00000000';

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
		this._loggerContext = 'HiQnet Device (' + name + ')';

		this._protocolVersionHex = Config.Get('ProtocolVersion').cleanHex();
		// Addresses are stored as Audio Architect decimal integers; convert to hex for wire use.
		this._sourceDeviceAddress = parseInt(Config.Get('SourceAddress'), 10).toString(16).padLeft(4);
		this._deviceAddress = parseInt(Config.Get('HiQnetDeviceAddress' + index), 10).toString(16).padLeft(4);
		this._virtualDeviceAddress = parseInt(Config.Get('HiQnetVirtualDeviceAddress' + index), 10).toString(16).padLeft(2);

		this._sourceMacAddress = System.MACAddress.cleanHex().replaceAll(':', '').replaceAll('-', '').padLeft(12);
		this._sourceSerialNumber = this._sourceMacAddress.padLeft(32);

		this.refreshControllerIp();
		this.initSystemVars();

		this._pollingEvent = new ScheduledEvent(onPollingEventElapsed, 'Periodic', 'Seconds', pollingIntervalSec);
		this._pollingEvent.UseHandleInCallbacks = true;
		this._pollingEvent.Disable();
		this.PollingEventHandle = this._pollingEvent.Handle;

		this._logger.logInfo(
			'Constructed:'
			+ ' srcDeviceAddr=' + this._sourceDeviceAddress.toUpperCase()
			+ ' srcMacAddr=' + this._sourceMacAddress.toUpperCase()
			+ ' srcSerialNum=' + this._sourceSerialNumber.toUpperCase()
			+ ' deviceAddress' + this._deviceAddress.toUpperCase()
			+ ' virtualDeviceAddress=' + this._virtualDeviceAddress.toUpperCase()
			+ ' controllerIp=' + HiQnetUtils.hexToIpString(this._controllerIpHex)
			+ ' protocolVer=0x' + this._protocolVersionHex.toUpperCase()
			+ ' pollIntervalSec=' + pollingIntervalSec
			+ ' parameterCount=' + (parameters.length - 1),
			LogInfoLevel.High,
			this._loggerContext
		);

		System.SignalEvent('Initialized' + index);
	}

	public OnCommRx(data: string) {
		const incoming = data.toHexByteArray().join('');
		this._logger.logInfo(
			'RX raw ' + (incoming.length / 2) + ' byte(s): ' + incoming.toUpperCase(),
			LogInfoLevel.High,
			this._loggerContext
		);

		this._rxBufferHex += incoming;

		while (this._rxBufferHex.length >= 12) {
			// Need at least 6 bytes to read message length field (bytes 2-5).
			const messageSize = hexToUnsignedInt(this._rxBufferHex.substring(4, 12));
			if (!messageSize || messageSize < STD_HEADER_LEN) {
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
				this._logger.logInfo(
					'Partial message: have ' + (this._rxBufferHex.length / 2)
					+ ' byte(s), need ' + messageSize + ' -- waiting for more data.',
					LogInfoLevel.High,
					this._loggerContext
				);
				return;
			}

			const messageHex = this._rxBufferHex.substring(0, messageHexLen);
			this._rxBufferHex = this._rxBufferHex.substring(messageHexLen);

			try {
				const message: HiQnetMessage = HiQnetUtils.parseMessage(messageHex, this._protocolVersionHex);
				this.processMessage(message);
			} catch (err) {
				const errorMessage = (err instanceof Error) ? err.message : String(err);
				this._logger.logError(
					'Error parsing message: ' + errorMessage,
					this._loggerContext
				);
			}
		}
	}

	public OnConnectionStateChanged(state: ConnectionState) {
		if (state == this._latestConnectionState) return;
		this._latestConnectionState = state;

		this._logger.logInfo('Connection state -> ' + ConnectionState[state], LogInfoLevel.High, this._loggerContext);

		switch (state) {
			case ConnectionState.Connected:
				this.setConnectedValue(true);
				System.SignalEvent('Connected' + this._index);
				this._rxBufferHex = '';
				this._subscriptionsSent = false;
				this._logger.logInfo('Connected -- sending Discovery.', LogInfoLevel.Low, this._loggerContext);
				this.sendDiscoveryQuery();
				this._pollingEvent.Enable();
				break;
			case ConnectionState.Disconnected:
				this._hasSubscribed = false;
				this.setConnectedValue(false);
				System.SignalEvent('Disconnected' + this._index);
				this._pollingEvent.Disable();
				break;
			case ConnectionState.Failed:
				this._hasSubscribed = false;
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
				LogInfoLevel.Low,
				this._loggerContext
			);
			this.sendMultiParamSubscribe();
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
			this.sendMultiParamSetPercent(parameter, hexValue);
		} else {
			this.sendMultiParamSet(parameter, hexValue);
		}

		// Echo locally so the UI reflects the change immediately.
		this.updateParameterValue(parameter, hexValue);
	}

	public Shutdown() {
		this._pollingEvent.Disable();
		if (this._latestConnectionState == ConnectionState.Connected) {
			if (this._hasSubscribed) {
				const subParams = this._parameters.filter(p => p && p.IsSubscribeEnabled);
				this.sendMultiParamUnsubscribe(subParams);
				this._hasSubscribed = false;
			}
			this.sendGoodbye();
		}
		this.Connection.shutdown();
	}

	//#region Outgoing messages

	private sendDiscoveryQuery() {
		const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, DEFAULT_OBJECT_ID);
		this._logger.logInfo('TX Discovery query to ' + destAddress.toUpperCase() + '.', LogInfoLevel.High, this._loggerContext);
		const payload = this.buildDiscoInfoPayload();
		const header = this.buildHeader(HiQnetMessageId.DISCO_INFO, destAddress, payload.length / 2, FLAG_GUARANTEED);
		this.transmit(header + payload);
	}

	private sendGoodbye() {
		// Goodbye payload = Device Address UWORD.
		const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, DEFAULT_OBJECT_ID);
		this._logger.logInfo('TX Goodbye to ' + destAddress.toUpperCase() + '.', LogInfoLevel.Low, this._loggerContext);
		const payload = this._deviceAddress.padLeft(4);
		const header = this.buildHeader(HiQnetMessageId.GOODBYE, destAddress, payload.length / 2, FLAG_GUARANTEED);
		this.transmit(header + payload);
	}

	private sendDiscoInfoKeepAlive() {
		const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, DEFAULT_OBJECT_ID);
		this._logger.logInfo('TX DiscoInfo(I) keep-alive to ' + destAddress.toUpperCase() + '.', LogInfoLevel.High, this._loggerContext);
		this.sendDiscoInfo(destAddress);
	}

	private buildDiscoInfoPayload(): string {
		let payload = this._sourceDeviceAddress;	// Source Device Address
		payload += '01';							// Cost (1 = direct connection to controller)		
		payload += SERIAL_NUMBER_LENGTH;
		payload += this._sourceSerialNumber;		// Serial number (16 bytes per spec)
		payload += MAX_MESSAGE_SIZE;
		payload += '2710';
		payload += ETHERNET_NETWORK_ID;
		payload += this._sourceMacAddress;
		payload += DHCP_STATIC_IDENTIFIER;
		payload += this._controllerIpHex;
		payload += this._controllerNetMask;
		payload += DEFAULT_GATEWAY_ADDRESS;
		return payload;
	}

	private sendDiscoInfo(destAddress: string) {
		const payload = this.buildDiscoInfoPayload();
		const flags = FLAG_GUARANTEED | FLAG_INFORMATION;
		const header = this.buildHeader(HiQnetMessageId.DISCO_INFO, destAddress, payload.length / 2, flags);
		this.transmit(header + payload);
	}

	private handleDiscoInfo(flags: number, sourceAddress: string, payload: string) {
		const isInfo = (flags & FLAG_INFORMATION) != 0;

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
						senderIp = HiQnetUtils.hexToIpString(payload.substring(ipOffset, ipOffset + 8));
					}
				}
			}
		}

		const sourceNode = sourceAddress.substring(0, 4).toLowerCase();
		const deviceNode = this._deviceAddress.padLeft(4).toLowerCase();

		if (!isInfo) {
			// Discovery(Q): device is discovering us so it can route subscription pushes back.
			// Respond with Discovery(I) so it can populate its routing table with our address.
			this._logger.logInfo(
				'Discovery(Q) from ' + sourceAddress.toUpperCase()
				+ (senderIp ? ' (' + senderIp + ')' : '')
				+ ' -- responding with Discovery(I).',
				LogInfoLevel.Low,
				this._loggerContext
			);
			this.sendDiscoInfo(sourceAddress);
		} else if (sourceNode === deviceNode && !this._subscriptionsSent) {
			// Discovery(I) from our target device acknowledging our query -- subscribe now.
			this._logger.logInfo(
				'Discovery(I) from device ' + sourceAddress.toUpperCase()
				+ (senderIp ? ' (' + senderIp + ')' : '')
				+ ' -- sending subscriptions.',
				LogInfoLevel.Low,
				this._loggerContext
			);
			this.sendMultiParamSubscribe();
			this._subscriptionsSent = true;
		} else {
			this._logger.logInfo(
				'Discovery(I) from ' + sourceAddress.toUpperCase()
				+ (senderIp ? ' (' + senderIp + ')' : '')
				+ (this._subscriptionsSent ? ' (already subscribed)' : ' (not our device)'),
				LogInfoLevel.High,
				this._loggerContext
			);
		}
	}

	private refreshControllerIp() {
		const resolved = HiQnetUtils.parseIpToHex(System.IPAddress).padLeft(8);

		if (resolved !== this._controllerIpHex) {
			this._controllerIpHex = resolved;
			this._controllerNetMask = HiQnetUtils.parseIpToHex(System.IPNetMask).padLeft(8);
			this._logger.logInfo(
				'Controller IP resolved to ' + HiQnetUtils.hexToIpString(this._controllerIpHex) + ' with netmask ' + HiQnetUtils.hexToIpString(this._controllerNetMask) + '.',
				LogInfoLevel.Low,
				this._loggerContext
			);
		}
	}

	private sendMultiParamSubscribe() {
		const subParams = this._parameters.filter(p => p && p.IsSubscribeEnabled);
		if (subParams.length === 0) return;

		this._logger.logInfo('Sending MultiParamSubscribe for ' + subParams.length + ' subscribable parameter(s).', LogInfoLevel.High, this._loggerContext);

		// Group parameters by destination object address.
		const grouped: { [key: string]: Parameter[] } = {};
		for (let i = 0; i < subParams.length; i++) {
			const p = subParams[i];
			const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, p.ObjectAddress);
			if (!(destAddress in grouped)) grouped[destAddress] = [];
			grouped[destAddress].push(p);
		}

		let totalCount = 0;
		for (const destAddress in grouped) {
			const params = grouped[destAddress];
			const destDisplay = params[0].ObjectAddress;
			let payload = '';
			payload += params.length.toString(16).padLeft(4);  // Num_Subscriptions

			const subscriberAddress = HiQnetUtils.createFullAddress(this._sourceDeviceAddress, DEFAULT_VIRTUAL_DEVICE_ADDRESS, DEFAULT_OBJECT_ID);
			for (let j = 0; j < params.length; j++) {
				const p = params[j];
				payload += p.Id;               // Publisher_Param_ID (UWORD)
				payload += '00';               // Subscription_Type: 0
				payload += subscriberAddress;  // Subscriber_Address (6 bytes)
				payload += p.Id;               // Subscriber_Param_ID (UWORD)
				payload += '000000';           // Reserved (3 bytes = 2 + 1 per spec)
				payload += '0032';             // Sensor_Rate: 50ms
			}

			this._logger.logInfo(
				'TX MultiParamSubscribe ' + params.length + ' param(s) to obj=0x' + destDisplay.toUpperCase(),
				LogInfoLevel.High, this._loggerContext
			);
			const header = this.buildHeader(HiQnetMessageId.MULTI_PARAM_SUBSCRIBE, destAddress, payload.length / 2, FLAG_GUARANTEED);
			this.transmit(header + payload);
			totalCount += params.length;
		}

		this._hasSubscribed = true;
		this._logger.logInfo('Sent MultiParamSubscribe for ' + totalCount + ' parameter(s).', LogInfoLevel.Low, this._loggerContext);
	}

	private sendMultiParamUnsubscribe(parameters: Parameter[]) {
		if (!parameters || parameters.length === 0) return;

		this._logger.logInfo(
			'TX MultiParamUnsubscribe for ' + parameters.length + ' previously subscribed parameter(s).',
			LogInfoLevel.Low, this._loggerContext
		);

		const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, DEFAULT_OBJECT_ID);
		const subscriberAddress = HiQnetUtils.createFullAddress(this._sourceDeviceAddress, DEFAULT_VIRTUAL_DEVICE_ADDRESS, DEFAULT_OBJECT_ID);
		
		let payload = '';
		payload += subscriberAddress;                              // Subscriber Address (HIQNETADDR)
		payload += parameters.length.toString(16).padLeft(4);      // Num_Subscriptions (UWORD)
		
		for (let i = 0; i < parameters.length; i++) {
			const p = parameters[i];
			payload += p.Id;          // Publisher_Param_ID (UWORD)
			payload += p.Id;          // Subscriber_Param_ID (UWORD)
		}

		const header = this.buildHeader(HiQnetMessageId.MULTI_PARAM_UNSUBSCRIBE, destAddress, payload.length / 2, FLAG_GUARANTEED);
		this.transmit(header + payload);
	}

	private sendMultiParamGet(parameters: Parameter[]) {
		if (parameters.length === 0) return;

		// Group parameters by destination object address.
		const grouped: { [key: string]: Parameter[] } = {};
		for (let i = 0; i < parameters.length; i++) {
			const p = parameters[i];
			const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, p.ObjectAddress);
			if (!(destAddress in grouped)) grouped[destAddress] = [];
			grouped[destAddress].push(p);
		}

		let totalCount = 0;
		for (const destAddress in grouped) {
			const params = grouped[destAddress];
			const destDisplay = params[0].ObjectAddress;
			let payload = '';
			payload += params.length.toString(16).padLeft(4);  // Num_Parameters

			for (let j = 0; j < params.length; j++) {
				payload += params[j].Id;  // Parameter_ID (UWORD) each
			}

			this._logger.logInfo(
				'TX MultiParamGet ' + params.length + ' param(s) to obj=0x' + destDisplay.toUpperCase(),
				LogInfoLevel.High, this._loggerContext
			);
			const header = this.buildHeader(HiQnetMessageId.MULTI_PARAM_GET, destAddress, payload.length / 2, FLAG_GUARANTEED);
			this.transmit(header + payload);
			totalCount += params.length;
		}

		this._logger.logInfo('Sent MultiParamGet for ' + totalCount + ' parameter(s).', LogInfoLevel.Low, this._loggerContext);
	}

	private sendMultiParamSet(parameter: Parameter, hexValue: string) {
		const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, parameter.ObjectAddress);
		this._logger.logInfo(
			'TX MultiParamSet "' + parameter.Name + '"'
			+ ' paramId=0x' + parameter.Id.toUpperCase()
			+ ' dataType=' + parameter.DataType
			+ ' value=0x' + hexValue.toUpperCase(),
			LogInfoLevel.High,
			this._loggerContext
		);
		let payload = '0001';                           		// NumParam UWORD
		payload += parameter.Id;                        		// Param_ID UWORD
		payload += parameter.DataType.toString(16).padLeft(2);  // DataType UBYTE
		payload += hexValue;                            		// Value
		const header = this.buildHeader(HiQnetMessageId.MULTI_PARAM_SET, destAddress, payload.length / 2, FLAG_GUARANTEED);
		this.transmit(header + payload);
	}

	private sendMultiParamSetPercent(parameter: Parameter, hexValueUword: string) {
		const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, parameter.ObjectAddress);
		const value = hexValueUword.length == 4 ? hexValueUword : hexValueUword.padLeft(4);
		this._logger.logInfo(
			'TX ParamSetPercent "' + parameter.Name + '"'
			+ ' paramId=0x' + parameter.Id.toUpperCase()
			+ ' value=0x' + value.toUpperCase()
			+ ' (' + hexToPercent115(value).toFixed(1) + '%)',
			LogInfoLevel.High,
			this._loggerContext
		);
		let payload = '0001';                           // NumPARAM UWORD
		payload += parameter.Id;                        // PARAM_ID UWORD
		payload += value;                               // PARAM_Value UWORD (1.15 fixed-point)
		const header = this.buildHeader(HiQnetMessageId.MULTI_PARAM_SET_PERCENT, destAddress, payload.length / 2, FLAG_GUARANTEED);
		this.transmit(header + payload);
	}

	//#region Manual debugging helpers

	private sendGetAttributes(attributeIds: number[]) {
		const destAddress = HiQnetUtils.createFullAddress(this._deviceAddress, this._virtualDeviceAddress, DEFAULT_OBJECT_ID);

		let payload = '';
		payload += attributeIds.length.toString(16).padLeft(4);  // Num_Attributes (UWORD)
		for (const attrId of attributeIds) {
			payload += attrId.toString(16).padLeft(4);           // Attribute_ID[] (UWORD each)
		}

		const flags = FLAG_GUARANTEED;
		const header = this.buildHeader(HiQnetMessageId.GET_ATTRIBUTES, destAddress, payload.length / 2, flags);
		this.transmit(header + payload);

		this._logger.logInfo(
			'TX GetAttributes to ' + destAddress.toUpperCase()
			+ ' attrs=[' + attributeIds.map(a => '0x' + a.toString(16).toUpperCase()).join(', ') + ']',
			LogInfoLevel.High,
			this._loggerContext
		);
	}

	private sendGetVDList() {
		const destAddress = BROADCAST_ADDRESS;
		const payload = DEFAULT_VIRTUAL_DEVICE_ADDRESS;  // Root Virtual Device index
		const flags = FLAG_GUARANTEED;
		const header = this.buildHeader(HiQnetMessageId.GET_VD_LIST, destAddress, payload.length / 2, flags);
		this.transmit(header + payload);

		this._logger.logInfo('TX GetVDList broadcast to ' + destAddress.toUpperCase(), LogInfoLevel.High, this._loggerContext);
	}

	public DumpDeviceInfo() {
		// Query all standard HiQnet attributes (IDs 0x0001–0x0006) on the device root VD.
		this.sendGetAttributes([0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006]);
	}

	public DumpVDList() {
		this.sendGetVDList();
	}

	//#endregion

	private buildHeader(messageId: HiQnetMessageId, destAddress: string, payloadByteLen: number, flagsBits: number): string {
		const totalLen = STD_HEADER_LEN + payloadByteLen;
		const sourceAddress = HiQnetUtils.createFullAddress(this._sourceDeviceAddress, DEFAULT_VIRTUAL_DEVICE_ADDRESS, DEFAULT_OBJECT_ID);

		let header = this._protocolVersionHex;
		header += STD_HEADER_LEN.toString(16).padLeft(2);
		header += totalLen.toString(16).padLeft(8);
		header += sourceAddress;
		header += destAddress;
		header += messageId.toString(16).padLeft(4);
		header += flagsBits.toString(16).padLeft(4);
		header += HOP_COUNT;
		header += '0000';	// Sequence number (can be 0 for our purposes since we don't use ACKs or retries)

		return header;
	}

	private transmit(messageHex: string) {
		const clean = messageHex.cleanHex();
		this._logger.logInfo('TX ' + (clean.length / 2) + ' byte(s): ' + clean.toUpperCase(), LogInfoLevel.High, this._loggerContext);
		const bytes = hexToBytes(clean);
		let raw = '';
		for (let i = 0; i < bytes.length; i++) {
			raw += String.fromCharCode(bytes[i]);
		}
		this.Connection.sendRawCommand(raw);
	}

	//#endregion

	//#region Incoming message processing

	private processMessage(message: HiQnetMessage) {
		this._logger.logInfo(
			'RX msgId=0x' + message.MessageId.toString(16).padLeft(4).toUpperCase()
			+ ' flags=0x' + message.Flags.toString(16).padLeft(4).toUpperCase()
			+ ' headerLenBytes=' + message.HeaderLengthBytes
			+ ' totalLenBytes=' + message.TotalLengthBytes
			+ ' src=' + message.SourceAddress.toUpperCase()
			+ ' seq=' + message.SeqNum
			+ ' payloadBytes=' + (message.Payload.length / 2),
			LogInfoLevel.High,
			this._loggerContext
		);

		// Parse and log any error extension (FLAGS bit 3).
		let effectivePayload = message.Payload;
		if ((message.Flags & 0x0008) != 0) {
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
					+ ' msgId=0x' + message.MessageId.toString(16).padLeft(4).toUpperCase()
					+ (errStr ? ' message="' + errStr + '"' : ' (no error string)'),
					this._loggerContext
				);
				effectivePayload = effectivePayload.substring(8 + strByteCount * 2);
			} else {
				this._logger.logError(
					'Error flag set but payload too short to parse (msgId=0x' + message.MessageId.toString(16).padLeft(4).toUpperCase() + ').',
					this._loggerContext
				);
			}
		}

		switch (message.MessageId) {
			case HiQnetMessageId.DISCO_INFO: /* Discovery */
				this.handleDiscoInfo(message.Flags, message.SourceAddress, effectivePayload);
				break;
			case HiQnetMessageId.GOODBYE: /* Goodbye */
				this._logger.logInfo('Received Goodbye from device.', LogInfoLevel.Low, this._loggerContext);
				break;
			case HiQnetMessageId.HELLO: /* Hello */
				this._logger.logInfo('Received Hello from device.', LogInfoLevel.High, this._loggerContext);
				this.handleHello(message.SourceAddress);
				break;
			case HiQnetMessageId.MULTI_PARAM_SET: /* MultiParamSet -- subscription push notification or get response */
				this._logger.logInfo(
					'RX MultiParamSet (0x0100) flags=0x' + message.Flags.toString(16).padLeft(4).toUpperCase()
					+ ' src=' + message.SourceAddress.toUpperCase(),
					LogInfoLevel.High,
					this._loggerContext
				);
				// Extract object address from source VD-OBJECT (bytes 3-5 of source address).
				// Avoids false matches when multiple parameters share the same param ID.
				{
					const srcObj = message.SourceAddress.substring(6, 12);
					this.handleMultiParamSet(effectivePayload, srcObj !== '000000' ? srcObj : null);
				}
				break;
			case HiQnetMessageId.MULTI_OBJECT_PARAM_SET: /* MultiObjectParamSet -- subscription push notification */
				this._logger.logInfo(
					'RX MultiObjectParamSet (0x0101) flags=0x' + message.Flags.toString(16).padLeft(4).toUpperCase()
					+ ' src=' + message.SourceAddress.toUpperCase()
					+ ' bytes=' + (effectivePayload.length / 2),
					LogInfoLevel.Low,
					this._loggerContext
				);
				this.handleMultiObjectParamSet(effectivePayload);
				break;
			case HiQnetMessageId.MULTI_PARAM_GET: /* MultiParamGet response */
				if ((message.Flags & (FLAG_INFORMATION | FLAG_REQUEST_ACK)) != 0) {
					this._logger.logInfo('Received MultiParamGet response (0x0103).', LogInfoLevel.High, this._loggerContext);
					const srcObj103 = message.SourceAddress.substring(6, 12);
					this.handleMultiParamSet(effectivePayload, srcObj103 !== '000000' ? srcObj103 : null);
				}
				break;
			case HiQnetMessageId.GET_ATTRIBUTES: /* GetAttributes response */
				if ((message.Flags & FLAG_INFORMATION) != 0) {
					this._logger.logInfo(
						'RX GetAttributes(I) from ' + message.SourceAddress.toUpperCase()
						+ ' payloadBytes=' + (effectivePayload.length / 2),
						LogInfoLevel.High,
						this._loggerContext
					);
					if (effectivePayload.length >= 16) {
						const respObjAddr = effectivePayload.substring(0, 12);
						const numAttrs = hexToUnsignedInt(effectivePayload.substring(12, 16));
						let attrOffset = 16;
						let attrEntries = '';
						for (let a = 0; a < numAttrs && attrOffset + 6 <= effectivePayload.length; a++) {
							const dataType = hexToUnsignedInt(effectivePayload.substring(attrOffset, attrOffset + 2));
							const numValues = hexToUnsignedInt(effectivePayload.substring(attrOffset + 2, attrOffset + 6));
							const valueDataLen = numValues * 2;
							const valueHex = effectivePayload.substring(attrOffset + 6, attrOffset + 6 + valueDataLen);
							attrEntries += ' [' + dataType + ':' + numValues + '=' + valueHex.toUpperCase() + ']';
							attrOffset += 6 + valueDataLen;
						}
						this._logger.logInfo(
							'GetAttributes response: obj=' + respObjAddr.toUpperCase()
							+ ' count=' + numAttrs + ' entries:' + attrEntries,
							LogInfoLevel.Low,
							this._loggerContext
						);
					}
				} else if ((message.Flags & FLAG_REQUEST_ACK) != 0) {
					this._logger.logInfo(
						'RX GetAttributes ACK from ' + message.SourceAddress.toUpperCase(),
						LogInfoLevel.High,
						this._loggerContext
					);
				} else {
					this._logger.logInfo(
						'RX GetAttributes(Q) from ' + message.SourceAddress.toUpperCase(),
						LogInfoLevel.High,
						this._loggerContext
					);
				}
				break;
			case HiQnetMessageId.MULTI_PARAM_SET_PERCENT: /* ParamSetPercent -- subscription push or ACK response */
				this._logger.logInfo(
					'RX ParamSetPercent (0x0102) flags=0x' + message.Flags.toString(16).padLeft(4).toUpperCase()
					+ ' src=' + message.SourceAddress.toUpperCase()
					+ ' bytes=' + (effectivePayload.length / 2),
					LogInfoLevel.High,
					this._loggerContext
				);
				if (effectivePayload.length >= 4) {
					const numParams = hexToUnsignedInt(effectivePayload.substring(0, 4));
					let offset = 4;
					for (let p = 0; p < numParams && offset + 6 <= effectivePayload.length; p++) {
						const paramId = effectivePayload.substring(offset, offset + 4);
						const valueHex = effectivePayload.substring(offset + 4, offset + 8);
						offset += 8;

						// Try to find the configured parameter by ID (ParamSetPercent doesn't include object addr in payload).
						let paramObj: Parameter | undefined;
						for (let pi = 0; pi < this._parameters.length && !paramObj; pi++) {
							const pp = this._parameters[pi];
							if (pp && pp.Id.toLowerCase() === paramId && pp.ObjectAddress.toLowerCase().indexOf(this._deviceAddress) === 0) {
								paramObj = pp;
							}
						}
						if (paramObj) {
							// 1.15 signed fixed-point → integer value.
							const n = Math.round(hexToPercent115(valueHex) / 100 * 0x7FFF);
							this._logger.logInfo(
								'ParamSetPercent update: "' + paramObj.Name + '" -> ' + hexToPercent115(valueHex).toFixed(1) + '% (raw=0x' + valueHex.toUpperCase() + ')',
								LogInfoLevel.High,
								this._loggerContext
							);
							SystemVars.Write('ParameterIntValue' + this._index + '_' + paramObj.Index, n);
						} else {
							this._logger.logInfo(
								'ParamSetPercent: no configured param for 0x' + paramId.toUpperCase() + ' -- skipping.',
								LogInfoLevel.Low,
								this._loggerContext
							);
						}
					}
				}
				break;
			case HiQnetMessageId.PARAM_SUBSCRIBE_PERCENT: /* ParamSubscribePercent -- subscription push notification */
				this._logger.logInfo(
					'RX ParamSubscribePercent (0x0111) flags=0x' + message.Flags.toString(16).padLeft(4).toUpperCase()
					+ ' src=' + message.SourceAddress.toUpperCase()
					+ ' bytes=' + (effectivePayload.length / 2),
					LogInfoLevel.High,
					this._loggerContext
				);
				if (effectivePayload.length >= 4) {
					const numParams = hexToUnsignedInt(effectivePayload.substring(0, 4));
					let offset = 4;
					for (let p = 0; p < numParams && offset + 6 <= effectivePayload.length; p++) {
						const paramId = effectivePayload.substring(offset, offset + 4);
						const valueHex = effectivePayload.substring(offset + 4, offset + 8);
						offset += 8;

						let paramObj: Parameter | undefined;
						for (let pi = 0; pi < this._parameters.length && !paramObj; pi++) {
							const pp = this._parameters[pi];
							if (pp && pp.Id.toLowerCase() === paramId && pp.ObjectAddress.toLowerCase().indexOf(this._deviceAddress) === 0) {
								paramObj = pp;
							}
						}
						if (paramObj) {
							const n = Math.round(hexToPercent115(valueHex) / 100 * 0x7FFF);
							this._logger.logInfo(
								'ParamSubscribePercent update: "' + paramObj.Name + '" -> ' + hexToPercent115(valueHex).toFixed(1) + '% (raw=0x' + valueHex.toUpperCase() + ')',
								LogInfoLevel.High,
								this._loggerContext
							);

							SystemVars.Write('ParameterIntValue' + this._index + '_' + paramObj.Index, n);
						} else {
							this._logger.logInfo(
								'ParamSubscribePercent: no configured param for 0x' + paramId.toUpperCase() + ' -- skipping.',
								LogInfoLevel.Low,
								this._loggerContext
							);
						}
					}
				}
				break;
			default:
				this._logger.logInfo('Unhandled message 0x' + message.MessageId.toString(16).padLeft(4).toUpperCase() + '.', LogInfoLevel.High, this._loggerContext);
				break;
		}
	}

	private handleHello(destAddress: string) {
		this._logger.logInfo('Sending Hello refusal to ' + destAddress.toUpperCase() + '.', LogInfoLevel.Low, this._loggerContext);

		// Per HiQnet spec: refuse session by sending Hello with Error extension.
		// Flags = 0x002C (Guaranteed + Error + Information).
		// Payload = errorExtension block (errorCode=UWORD, strByteCount=UWORD) = 4 bytes.
		const flags = FLAG_GUARANTEED | FLAG_REQUEST_ACK | FLAG_INFORMATION; // 0x002C
		const header = this.buildHeader(HiQnetMessageId.HELLO, destAddress, 4, flags);

		this.transmit(header + '0000' + '0000'); // errorCode=0, strByteCount=0
	}

	private handleMultiObjectParamSet(payload: string) {
		if (payload.length < 4) {
			this._logger.logError('MultiObjectParamSet payload too short.', this._loggerContext);
			return;
		}
		let pos = 0;
		const numObjects = hexToUnsignedInt(payload.substring(pos, pos + 4));
		pos += 4;

		this._logger.logInfo('MultiObjectParamSet: ' + numObjects + ' object(s).', LogInfoLevel.High, this._loggerContext);

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

			this._logger.logInfo(
				'  Object[' + o + ']: vd+obj=0x' + vdAndObject.toUpperCase()
				+ ' (objAddr=0x' + objectAddress.toUpperCase() + ')',
				LogInfoLevel.High,
				this._loggerContext
			);

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
		this._logger.logInfo(
			'handleMultiParamSet: objFilter=' + (objectAddressOverride ? '0x' + objectAddressOverride.toUpperCase() : '*'),
			LogInfoLevel.High,
			this._loggerContext
		);
		this.consumeMultiParamBlock(payload, 0, objectAddressOverride);
	}

	// Parses one NumParams + param-value block beginning at `pos` inside `payload`.
	// objectAddress: if non-null, only parameters whose ObjectAddress matches are updated.
	// Returns the new buffer position, or -1 on parse failure.
	private consumeMultiParamBlock(payload: string, pos: number, objectAddress: string | null): number {
		if (payload.length < pos + 4) return -1;
		const numParams = hexToUnsignedInt(payload.substring(pos, pos + 4));
		pos += 4;

		this._logger.logInfo(
			'  ' + numParams + ' param(s) for obj=' + (objectAddress ? '0x' + objectAddress.toUpperCase() : '*'),
			LogInfoLevel.High,
			this._loggerContext
		);

		for (let p = 0; p < numParams; p++) {
			if (payload.length < pos + 6) {
				this._logger.logError('Param block truncated at param index ' + p + '.', this._loggerContext);
				return -1;
			}
			const paramIdHex  = payload.substring(pos, pos + 4).toLowerCase();
			const paramDataTypeHex = payload.substring(pos + 4, pos + 6);
			const dataType = HiQnetUtils.hexToDataType(paramDataTypeHex);
			pos += 6;
			
			if (dataType === null) {
				this._logger.logError(
					'Unknown data type 0x' + paramDataTypeHex + ' for param 0x' + paramIdHex.toUpperCase() + ' -- stopping parse.',
					this._loggerContext
				);
				return -1;
			}

			const valueHexChars = HiQnetUtils.hexCharsForDataType(dataType);
			let valueHex: string;
			let consumed: number;

			if (valueHexChars > 0) {
				if (payload.length < pos + valueHexChars) {
					this._logger.logError(
						'Fixed-width value truncated for param 0x' + paramIdHex.toUpperCase()
						+ ' (need ' + valueHexChars + ' chars, have ' + (payload.length - pos) + ').',
						this._loggerContext
					);
					return -1;
				}
				valueHex = payload.substring(pos, pos + valueHexChars);
				consumed = valueHexChars;
			} else {
				if (payload.length < pos + 4) {
					this._logger.logError('Variable-length size field truncated.', this._loggerContext);
					return -1;
				}
				const blockBytes = hexToUnsignedInt(payload.substring(pos, pos + 4));
				const blockHex   = blockBytes * 2;
				if (payload.length < pos + 4 + blockHex) {
					this._logger.logError(
						'Variable-length data truncated for param 0x' + paramIdHex.toUpperCase()
						+ ' (declared ' + blockBytes + ' bytes, only ' + ((payload.length - pos - 4) / 2) + ' available).',
						this._loggerContext
					);
					return -1;
				}
				valueHex = payload.substring(pos + 4, pos + 4 + blockHex);
				consumed = 4 + blockHex;
			}
			
			pos += consumed;

			this._logger.logInfo(
				'    Param id=0x' + paramIdHex.toUpperCase()
				+ ' dataType=' + dataType
				+ ' rawValue=0x' + valueHex.toUpperCase(),
				LogInfoLevel.High,
				this._loggerContext
			);

			const parameter = this.findMatchingParameter(objectAddress, paramIdHex);

			if (!parameter) {
				this._logger.logInfo(
					'    No configured parameter for obj='
					+ (objectAddress ? '0x' + objectAddress.toUpperCase() : '*')
					+ ' id=0x' + paramIdHex.toUpperCase() + ' -- skipping.',
					LogInfoLevel.High,
					this._loggerContext
				);
				continue;
			}

			if (parameter.DataType != dataType) {
				this._logger.logError(
					'    Data type mismatch for parameter "' + parameter.Name + '" -- expected ' + parameter.DataType + ', got ' + dataType + '.',
					this._loggerContext
				);
				continue;
			}

			this._logger.logInfo('    Matched to "' + parameter.Name + '".', LogInfoLevel.High, this._loggerContext);

			this.updateParameterValue(parameter, valueHex);
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

	private updateParameterValue(parameter: Parameter, valueHex: string) {
		switch (parameter.VariableType) {
			case 'Boolean': {
				const decoded = HiQnetUtils.decodeHiQnetNumericValue(parameter.DataType, valueHex);
				const boolVal = decoded != 0;
				this._logger.logInfo(
					'Update "' + parameter.Name + '" -> Boolean ' + boolVal
					+ ' (raw=0x' + valueHex.toUpperCase() + ')',
					LogInfoLevel.High,
					this._loggerContext
				);
				SystemVars.Write('ParameterBoolValue' + this._index + '_' + parameter.Index, boolVal, 'BOOLEAN');
				break;
			}
			case 'Integer': {
				let n: number = HiQnetUtils.decodeHiQnetNumericValue(parameter.DataType, valueHex);
				if (parameter.DataType == HiQnetDataType.HQ_FLOAT32 || parameter.DataType == HiQnetDataType.HQ_FLOAT64) {
					n = Math.round(n * 100); // For floats, store as integer percentage (e.g. 0.75 → 75).
				}
				this._logger.logInfo(
					'Update "' + parameter.Name + '" -> Integer ' + n
					+ ' (raw=0x' + valueHex.toUpperCase() + ')',
					LogInfoLevel.High,
					this._loggerContext
				);
				SystemVars.Write('ParameterIntValue' + this._index + '_' + parameter.Index, n);
				break;
			}
			case 'String': {
				const str = HiQnetUtils.decodeHiQnetStringValue(parameter.DataType, valueHex);
				this._logger.logInfo(
					'Update "' + parameter.Name + '" -> String "' + str + '"'
					+ ' (raw=0x' + valueHex.toUpperCase() + ')',
					LogInfoLevel.High,
					this._loggerContext
				);
				SystemVars.Write('ParameterStringValue' + this._index + '_' + parameter.Index, str);
				break;
			}
		}
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

	//#endregion
}
