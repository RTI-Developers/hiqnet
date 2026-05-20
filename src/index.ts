
// Converts Audio Architect dot-notation object address (e.g. "15.22.7") to 6-char hex ("0f1607").
function parseObjectAddress(addr: string): string {
    const parts = addr.split('.');
    if (parts.length !== 3) return '000000';
    let hex = '';
    for (let i = 0; i < 3; i++) {
        hex += parseInt(parts[i], 10).toString(16).padLeft(2);
    }
    return hex;
}

const g_debug = Config.Get('DebugTrace') == 'true';
const g_logger = new Logger('HiQnet Driver', g_debug);

g_logger.logInfo('Initializing HiQnet Driver');

const g_totalDeviceCount = parseInt(Config.Get('TotalDeviceCount'));
const g_pollingIntervalSecondsRaw = parseInt(Config.Get('PollingIntervalSeconds'));
const g_pollingIntervalSeconds = isNaN(g_pollingIntervalSecondsRaw) || g_pollingIntervalSecondsRaw < 1 ? 8 : g_pollingIntervalSecondsRaw;

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
        const variableTypeRaw = parseInt(Config.Get('ParameterVariableType' + i + '_' + j));
        const variableType: 'Boolean' | 'Integer' | 'String' =
            variableTypeRaw == 1 ? 'Boolean' : variableTypeRaw == 3 ? 'String' : 'Integer';
        const setMethodRaw = parseInt(Config.Get('ParameterSetMethod' + i + '_' + j));
        parameters[j] = {
            DataType: Config.Get('ParameterDataType' + i + '_' + j).cleanHex(),
            Id: parseInt(Config.Get('ParameterId' + i + '_' + j), 10).toString(16).padLeft(4),
            Index: j,
            IsSetAllowed: Config.Get('ParameterAllowSet' + i + '_' + j) == 'true',
            IsSubscribeEnabled: Config.Get('ParameterEnableSubscribe' + i + '_' + j) == 'true',
            Name: Config.Get('ParameterName' + i + '_' + j),
            ObjectAddress: parseObjectAddress(Config.Get('HiQnetObjectAddress' + i + '_' + j)),
            SetMethod: setMethodRaw == 2 ? 'Set %' : 'Set',
            VariableType: variableType
        };
    }

    const connection = new DeviceConnection(
        address,
        3804,
        DeviceConnectionOnCommRx,
        DeviceConnectionOnConnect,
        DeviceConnectionOnDisconnect,
        DeviceConnectionOnFailureTick,
        (state: ConnectionState) => { device.OnConnectionStateChanged(state); },
        g_logger
    );

    const device = new Device(
        i,
        name,
        connection,
        parameters,
        g_pollingIntervalSeconds,
        DeviceOnPollingEventElapsed,
        g_logger
    );

    g_devicesGlobalHandlerMap.register(device.PollingEventHandle, device);
    g_devicesGlobalHandlerMap.register(device.Connection.TcpHandle, device);
    g_devicesGlobalHandlerMap.register(device.Connection.FailureTimerHandle, device);

    g_devices[i] = device;

    connection.start();
}

System.OnShutdownFunc = function() {
    g_logger.logInfo('Driver shutting down — closing device connections');
    for (let i = 1; i < g_devices.length; i++) {
        const d = g_devices[i];
        if (d) d.Shutdown();
    }
};

//#region DeviceConnection event handlers

function DeviceConnectionOnCommRx(data: string, handle: number) {
    const device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!device) return;
    device.OnCommRx(data);
}

function DeviceConnectionOnConnect(handle: number) {
    const device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!device) {
        g_logger.logError('DeviceConnectionOnConnect: unknown handle ' + handle);
        return;
    }
    device.Connection.onConnect();
}

function DeviceConnectionOnDisconnect(handle: number) {
    const device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!device) {
        g_logger.logError('DeviceConnectionOnDisconnect: unknown handle ' + handle);
        return;
    }
    device.Connection.onDisconnect();
}

function DeviceConnectionOnFailureTick(handle: number) {
    const device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!device) {
        g_logger.logError('DeviceConnectionOnFailureTick: unknown handle ' + handle);
        return;
    }
    device.Connection.onFailureTick();
}

//#endregion

//#region Device event handlers

function DeviceOnPollingEventElapsed(handle: number) {
    const device = g_devicesGlobalHandlerMap.getMappedValueFromHandle(handle);
    if (!device) {
        g_logger.logError('DeviceOnPollingEventElapsed: unknown handle ' + handle);
        return;
    }
    device.OnPollingEventElapsed();
}

//#endregion

function setParameter(deviceIndex: number, parameterIndex: number, hexValue: string) {
    if (deviceIndex < 1 || deviceIndex >= g_devices.length) {
        g_logger.logError('setParameter: deviceIndex (' + deviceIndex + ') out of range');
        return;
    }
    const device = g_devices[deviceIndex];
    if (!device) return;
    device.SetParameter(parameterIndex, hexValue);
}
