
const g_debug = Config.Get('DebugTrace') == 'true';
const g_logger = new Logger('HiQNet Driver', g_debug);

g_logger.logInfo('Initializing HiQNet Driver');

const g_totalDeviceCount = parseInt(Config.Get('TotalDeviceCount'));

g_logger.logTrace('Total Device Count (' + g_totalDeviceCount + ')');

const g_devices = new Array<Device>();

const g_devicesGlobalHandlerMap = new GlobalHandlerMap<Device>();

for (let i = 1; i <= g_totalDeviceCount; i++) {
    const name = Config.Get('DeviceName' + i);
    const address = Config.Get('DeviceAddress' + i);

    g_logger.logTrace('Instantiating device (' + name + ')');

    const parameterCount = parseInt(Config.Get('DeviceParameterCount' + i));
    const parameters = new Array<Parameter>();
    for (let j = 1; j <= parameterCount; j++) {
        parameters[j] = {
            DataType: Config.Get('ParameterDataType' + i + '_' + j),
            Id: Config.Get('ParameterId' + i + '_' + j).cleanHex(),
            Index: j,
            IsSetAllowed: Config.Get('ParameterAllowSet' + i + '_' + j)  == 'true',
            IsSubscribeEnabled: Config.Get('ParameterEnableSubscribe' + i + '_' + j) == 'true',
            Name: Config.Get('ParameterName' + i + '_' + j),
            ObjectAddress: Config.Get('HiQNetObjectAddress' + i + '_' + j).cleanHex(),
            SensorRate: Config.Get('ParameterSensorRate' + i + '_' + j).cleanHex(),
            SetMethod: parseInt(Config.Get('ParameterSetMethod' + i + '_' + j)) == 1 ? 'Set' : 'Set %',
            SubscriptionType: Config.Get('ParameterSubscriptionType' + i + '_' + j).cleanHex(),
            VariableType: parseInt(Config.Get('ParameterVariableType' + i + '_' + j)) == 1 ? 'Boolean' : parseInt(Config.Get('ParameterVariableType' + i + '_' + j)) == 2 ? 'Integer' : 'String'
        };
    }

    const device = new Device(
		i,
		name,
        new DeviceConnection(
            address,
            DeviceConnectionOnCommRx,
            DeviceConnectionOnConnect,
            DeviceConnectionOnDisconnect,
            DeviceConnectionOnTimeout,
            DeviceConnectionOnReconnect,
            (state: ConnectionState) => { device.OnConnectionStateChanged(state); },
            g_logger
        ),
        parameters,
        DeviceOnPollingIntervalElapsed,
		g_logger
	);

	g_devicesGlobalHandlerMap.register(device.PollingTimerHandle, device);
    g_devicesGlobalHandlerMap.register(device.Connection.TcpHandle, device);
	g_devicesGlobalHandlerMap.register(device.Connection.TimoutTimerHandle, device);
    g_devicesGlobalHandlerMap.register(device.Connection.ReconnectTimerHandle, device);

    g_devices[i] = device;
}

//#region DeviceConnection event handlers

function DeviceConnectionOnCommRx(data: string, handle: number) {
    g_logger.logTrace('DeviceOnCommRx');

    const device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!device) {
        g_logger.logError('DeviceConnectionOnCommRx: Error retrieving device from handle: ' + handle);
        return;
    }

    device.OnCommRx(data);
}

function DeviceConnectionOnConnect(handle: number) {
    g_logger.logTrace('DeviceConnectionOnConnect');

    const Device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!Device) {
        g_logger.logError('DeviceConnectionOnConnect: Error retrieving device from handle: ' + handle);
        return;
    }
    
    Device.Connection.onConnect();
}

function DeviceConnectionOnDisconnect(handle: number) {
    g_logger.logTrace('DeviceConnectionOnDisconnect');

    const Device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!Device) {
        g_logger.logError('DeviceConnectionOnDisconnect: Error retrieving device from handle: ' + handle);
        return;
    }
    
    Device.Connection.onDisconnect();
}

function DeviceConnectionOnTimeout(handle: number) {
    g_logger.logTrace('DeviceConnectionOnTimeout');

    const Device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!Device) {
        g_logger.logError('DeviceConnectionOnTimeout: Error retrieving device from handle: ' + handle);
        return;
    }

    Device.Connection.onTimeout();
}

function DeviceConnectionOnReconnect(handle: number) {
    g_logger.logTrace('DeviceConnectionOnReconnect');

    const Device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!Device) {
        g_logger.logError('DeviceConnectionOnReconnect: Error retrieving device from handle: ' + handle);
        return;
    }

    Device.Connection.onReconnect();
}

//#endregion

//#region Device event handlers

function DeviceOnPollingIntervalElapsed(handle: number) {
    g_logger.logTrace('DeviceOnPollingIntervalElapsed');

    const Device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!Device) {
        g_logger.logError('DeviceOnPollingIntervalElapsed: Error retrieving device from handle: ' + handle);
        return;
    }

    Device.OnPollingIntervalElapsed();
}

//#endregion

function setParameter(deviceIndex: number, parameterIndex: number, hexValue: string) {
    g_logger.logTrace('setParameter');
    g_logger.logTrace('deviceIndex (' + deviceIndex + '), parameterIndex (' + parameterIndex + '), hexValue (' + hexValue + ')');

    if (deviceIndex >= g_devices.length) {
        g_logger.logError('deviceIndex (' + deviceIndex + ') too large.  Device count is (' + g_devices.length + ')');
        return;
    }

    g_devices[deviceIndex].SetParameter(parameterIndex, hexValue);
}