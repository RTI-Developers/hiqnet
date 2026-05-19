class Device {
	private readonly _hiQNetDeviceAddressPrefix: string;
	private readonly _hiQNetSourceAddressPrefix: string;
	private readonly _index: number;
	private readonly _logger: Logger;
    private readonly _loggerContext: string;
	private readonly _onPollingIntervalElapsed: (handle: number) => void;
	private readonly _parameters: Parameter[];
	private readonly _pollingTimer: Timer;
	
	private latestConnectionState: ConnectionState | undefined = undefined;
	private sessionNumber: number = 0;

	public readonly Connection: DeviceConnection;
	public Name: string;
	public PollingTimerHandle: number;

	private incrementSessionNumber() {
        this._logger.logTrace('incrementSessionNumber', this._loggerContext);

		if (this.sessionNumber < 65535) {
			this.sessionNumber++;
		} else {
			this.sessionNumber = 1;
		}

        this._logger.logTrace('New session number is (' + this.sessionNumber + ')', this._loggerContext);
	}

	private setConnectedValue(value: boolean) { SystemVars.Write('Connected' + this._index, value); }
	private setBooleanParameterValue(parameterIndex: number, value: boolean) { SystemVars.Write('ParameterBoolValue' + this._index + '_' + parameterIndex, value || false); }
	private setIntegerParameterValue(parameterIndex: number, value: number) { SystemVars.Write('ParameterIntValue' + this._index + '_' + parameterIndex, value || -999); }
	private setStringParameterValue(parameterIndex: number, value: string) { SystemVars.Write('ParameterStringValue' + this._index + '_' + parameterIndex, value || ''); }
	
	private sendHelloQueryMessage() {
        this._logger.logTrace('sendHelloQueryMessage', this._loggerContext);

		const hexDestAddress = this._hiQNetDeviceAddressPrefix + '000000';
        this._logger.logTrace('hexDestAddress (' + hexDestAddress + ')', this._loggerContext);

		let hexCommand = Config.Get('ProtocolVersion'); // Protocol Version (1 Byte)
		hexCommand += '19'; // Header Size (1 Byte)
		hexCommand += parseInt('29').toString(16).padLeft(8); // Body Size (4 Bytes)
		hexCommand += Config.Get('SourceAddress'); // Source Address (6 Bytes)
		hexCommand += hexDestAddress; // Destination Address (6 Bytes)
		hexCommand += '0008'; // Message Id (2 Bytes)
		hexCommand += '0020'; // Flags (2 bytes)
		hexCommand += Config.Get('HopCount'); // Hop Count (1 Byte)
		hexCommand += '0000'; // Sequence Number (2 Bytes)  TODO: Increment?
		hexCommand += this.sessionNumber.toString(16).padLeft(4); // Session Number (2 Bytes)
		hexCommand += '01FF'; // Flag Mask (2 Bytes)

		hexCommand = hexCommand.cleanHex();
        this._logger.logTrace('hexCommand (' + hexCommand + ')', this._loggerContext);

		const rawCommand = String.fromCharCode(... hexToBytes(hexCommand));
        this._logger.logTrace('rawCommand (' + rawCommand + ')', this._loggerContext);

		this.Connection.sendRawCommand(rawCommand);
	}

	private sendParamSubscribe(parameter: Parameter) {
        this._logger.logTrace('sendParamSubscribe', this._loggerContext);
        this._logger.logTrace('paramater (' + parameter + ')', this._loggerContext);

		const hexDestAddress = this._hiQNetDeviceAddressPrefix + parameter.ObjectAddress;
        this._logger.logTrace('hexDestAddress (' + hexDestAddress + ')', this._loggerContext);

		const hexSubscriberAddress = this._hiQNetSourceAddressPrefix + parameter.ObjectAddress;
        this._logger.logTrace('hexSubscriberAddress (' + hexSubscriberAddress + ')', this._loggerContext);

		let hexCommand = Config.Get('ProtocolVersion'); // Protocol Version (1 Byte)
		hexCommand += '19'; // Header Size (1 Byte)
		hexCommand += '0000002B'; // Body Size (4 Bytes)
		hexCommand += Config.Get('SourceAddress'); // Source Address (6 Bytes)
		hexCommand += hexDestAddress; // Destination Address (6 Bytes)
		hexCommand += '010F'; // Message Id (2 Bytes)
		hexCommand += '0020'; // Flags (2 bytes)
		hexCommand += Config.Get('HopCount'); // Hop Count (1 Byte)
		hexCommand += '0000'; // Sequence Number (2 Bytes)  TODO: Increment?
		hexCommand += '0001'; // Number Subcriptions (2 Bytes)
		hexCommand += parameter.Id; // Publisher Parameter Id (2 Bytes)
		hexCommand += parameter.SubscriptionType; // Subscription Type (1 Byte)
		hexCommand += hexSubscriberAddress; // Subscriber Address (6 Bytes)
		hexCommand += parameter.Id; // Subscriber Parameter Id (2 Bytes)
		hexCommand += '000000'; // Reserved (3 Bytes)
		hexCommand += parameter.SensorRate; // Sensor Rate (2 Bytes)

		hexCommand = hexCommand.cleanHex();
        this._logger.logTrace('hexCommand (' + hexCommand + ')', this._loggerContext);

		const rawCommand = String.fromCharCode(... hexToBytes(hexCommand));
        this._logger.logTrace('rawCommand (' + rawCommand + ')', this._loggerContext);

		this.Connection.sendRawCommand(rawCommand);
	}

	private updateParameterValueVariable(parameter: Parameter, hexValue: string) {
		this._logger.logTrace('updateParameterValueVariable', this._loggerContext);
        this._logger.logTrace('paramater (' + parameter + '), value (' + hexValue + ')', this._loggerContext);

		switch (parameter.VariableType) {
			case 'Boolean': {
				const value = Boolean(hexStringToNumber(hexValue)).valueOf();
				this._logger.logTrace('Updating parameter boolean value variable', this._loggerContext);
				SystemVars.Write('ParameterBoolValue' + this._index + '_' + parameter.Index, value, 'BOOLEAN');
				break;
			}
			case 'Integer': {
				const value = hexStringToNumber(hexValue);
				this._logger.logTrace('Updating parameter integer value variable', this._loggerContext);
				SystemVars.Write('ParameterIntValue' + this._index + '_' + parameter.Index, value);
				break;
			}
			case 'String': {
				const value = String.fromCharCode(... hexToBytes(hexValue));
				this._logger.logTrace('Updating parameter string value variable', this._loggerContext);
				SystemVars.Write('ParameterStringValue' + this._index + '_' + parameter.Index, value);
				break;
			}
		}
	}

	public constructor(index: number, name: string, connection: DeviceConnection, parameters: Parameter[], onPollingIntervalElapsed: (handle: number) => void, logger: Logger) {
		this._index = index;
		this.Name = name;
		this.Connection = connection;
		this._parameters = parameters;
		this._onPollingIntervalElapsed = onPollingIntervalElapsed;
		this._logger = logger;
		this._loggerContext = 'HiQNet Device (' + name + ')';

		this._hiQNetDeviceAddressPrefix = (Config.Get('HiQNetDeviceAddress' + index) + Config.Get('HiQNetVirtualDeviceAddress' + index)).cleanHex();
        this._logger.logTrace('_hiQNetAddressPrefix (' + this._hiQNetDeviceAddressPrefix + ')', this._loggerContext);

		this._hiQNetSourceAddressPrefix = Config.Get('SourceAddress').cleanHex().substring(0, 6);
        this._logger.logTrace('_sourceQNetAddressPrefix (' + this._hiQNetSourceAddressPrefix + ')', this._loggerContext);

		this._pollingTimer = new Timer();
		this._pollingTimer.UseHandleInCallbacks = true;
		this.PollingTimerHandle = this._pollingTimer.Handle;

		System.SignalEvent('Initialized' + index);
	}
	
    public OnCommRx(data: string) {
        this._logger.logTrace('onCommRx', this._loggerContext);
        this._logger.logTrace('data (' + data + ')', this._loggerContext);

		const hexData = data.toHexByteArray().join('');
        this._logger.logTrace('hexData (' + hexData + ')', this._loggerContext);

		const protocolVersionHex = hexData.substring(0, 2); // 1 Byte
		this._logger.logTrace('protocolVersionHex (' + protocolVersionHex + ')', this._loggerContext);
		if (protocolVersionHex != Config.Get('ProtocolVersion')) {
			this._logger.logError('Unexpected Protocol Version [' + protocolVersionHex + ']', this._loggerContext);
			return;
		}

		const headerSizeHex = hexData.substring(2, 4); // 1 Byte
		this._logger.logTrace('headerSizeHex (' + headerSizeHex + ')', this._loggerContext);
		const headerSize = hexStringToNumber(headerSizeHex);
		this._logger.logTrace('headerSize (' + headerSize + ')', this._loggerContext);

		const messageSizeHex = hexData.substring(4, 12); // 8 Bytes
		this._logger.logTrace('messageSizeHex (' + messageSizeHex + ')', this._loggerContext);
		const messageSize = hexStringToNumber(messageSizeHex);
		this._logger.logTrace('messageSize (' + messageSize + ')', this._loggerContext);

		const sourceAddressHex = hexData.substring(12, 24); // 6 Bytes
		this._logger.logTrace('sourceAddressHex (' + sourceAddressHex + ')', this._loggerContext);

		const destAddressHex = hexData.substring(24, 36); // 6 Bytes
		this._logger.logTrace('destAddressHex (' + destAddressHex + ')', this._loggerContext);

		const messageIdHex = hexData.substring(36, 40); // 2 Bytes
		this._logger.logTrace('messageIdHex (' + messageIdHex + ')', this._loggerContext);

		const payload = hexData.substring(headerSize * 2);
		this._logger.logTrace('payload (' + payload + ')', this._loggerContext);

		switch (messageIdHex) {
			case '0000': { // DiscInfo Message
				this._logger.logTrace('Received DiscInfo Message', this._loggerContext);
				break;
			}
			case '0008': { // Hello Message
				this._logger.logTrace('Received Hello Message', this._loggerContext);
				break;
			}
			case '0101': { // MultiObjectParamSet Message
				this._logger.logTrace('Received MultiObjectParamSet Message', this._loggerContext);
				const messsageObjectId = payload.substring(6, 12); // 3 Bytes
				this._logger.logTrace('messsageObjectId (' + messsageObjectId + ')', this._loggerContext);
				const messageParameterId = payload.substring(16, 20); // 2 Bytes
				this._logger.logTrace('messageParameterId (' + messageParameterId + ')', this._loggerContext);
				const parameter = this._parameters.filter(p => p && p.ObjectAddress == messsageObjectId && p.Id == messageParameterId)[0] ?? null;

				if (!parameter) {
					this._logger.logInfo('Received MultiObjectParamSet message but did not match known parameter.', this._loggerContext);
					break;
				}

				const hexValue = payload.substring(23, 24); // 1 Byte
				this._logger.logTrace('Received MultiObjectParamSet message for parameter (' + parameter.Name + ') with hexValue (' + hexValue + ')', this._loggerContext);

				this.updateParameterValueVariable(parameter, hexValue);

				break;
			}
			default: {
				this._logger.logTrace('Received Unhandled Message with MessageId (0x' + messageIdHex + ')', this._loggerContext);
				break;
			}
		}
    }

	public OnConnectionStateChanged(state: ConnectionState) {
		this._logger.logTrace('onConnectionStateChanged', this._loggerContext);
        this._logger.logTrace('state (' + ConnectionState[state] + ')', this._loggerContext);

		if (state == this.latestConnectionState) {
			return;
		}

		this.latestConnectionState = state;

		switch(state) {
			case ConnectionState.Connected:
				this.setConnectedValue(true);
				System.SignalEvent('Connected' + this._index);
				this._pollingTimer.Stop();
				this._pollingTimer.Start(this._onPollingIntervalElapsed, 10000);
				this.incrementSessionNumber();
				this.sendHelloQueryMessage();
				for (const parameter of this._parameters) {
					if (parameter && parameter.IsSubscribeEnabled) {
						this.sendParamSubscribe(parameter);
					}
				}
				break;
			case ConnectionState.Disconnected:
				this.setConnectedValue(false);
				System.SignalEvent('Disconnected' + this._index);
				this._pollingTimer.Stop();
				break;
			case ConnectionState.Failed:
				this.setConnectedValue(false);
				System.SignalEvent('ConnectionFailed' + this._index);
				this._pollingTimer.Stop();
				break;
		}
	}
	
	public OnPollingIntervalElapsed() {
        this._logger.logTrace('onPollingIntervalElapsed', this._loggerContext);

		this._pollingTimer.Start(this._onPollingIntervalElapsed, 10000);

		this.sendHelloQueryMessage();
	}

	public SetParameter(parameterIndex: number, hexValue: string) {
		hexValue = hexValue.cleanHex();

		this._logger.logTrace('SetParameter', this._loggerContext);
        this._logger.logTrace('parameterIndex (' + parameterIndex + '), hexValue (' + hexValue + ')', this._loggerContext);

		if (parameterIndex >= this._parameters.length) {
			this._logger.logError('parameterIndex (' + parameterIndex + ') too large.  Parameter count is (' + this._parameters.length + ')', this._loggerContext);
			return;
		}

		const parameter = this._parameters[parameterIndex];

		if (!parameter.IsSetAllowed) {
			this._logger.logError('Parameter (' + parameter.Name + ') with index (' + parameterIndex + ') is not configured to allow setting its value.', this._loggerContext);
			return;
		}

		const hexDestAddress = this._hiQNetDeviceAddressPrefix + parameter.ObjectAddress;

		let hexCommand = Config.Get('ProtocolVersion'); // Protocol Version (1 Byte)
		hexCommand += '19'; // Header Size (1 Byte)
		hexCommand += (30 + (hexValue.length / 2)).toString(16).padLeft(8); // Body Size (4 Bytes)
		hexCommand += Config.Get('SourceAddress'); // Source Address (6 Bytes)
		hexCommand += hexDestAddress; // Destination Address (6 Bytes)
		hexCommand += parameter.SetMethod == 'Set' ? '0100' : '0102'; // Message Id (2 Bytes)
		hexCommand += '0020'; // Flags (2 bytes)
		hexCommand += Config.Get('HopCount'); // Hop Count (1 Byte)
		hexCommand += '0000'; // Sequence Number (2 Bytes)  TODO: Increment?
		hexCommand += '0001'; // Number of Params (2 Bytes)
		hexCommand += parameter.Id; // Parameter Id (2 Bytes)
		hexCommand += parameter.DataType; // Parameter Data Type (1 Byte)
		hexCommand += hexValue; // Value (hexValue.length / 2 Bytes)

		hexCommand = hexCommand.cleanHex();
        this._logger.logTrace('hexCommand (' + hexCommand + ')', this._loggerContext);

		const rawCommand = String.fromCharCode(... hexToBytes(hexCommand));
        this._logger.logTrace('rawCommand (' + rawCommand + ')', this._loggerContext);

		this.Connection.sendRawCommand(rawCommand);

		this.updateParameterValueVariable(parameter, hexValue);
	}
}
