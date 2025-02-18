class DeviceConnection
{
    private readonly _tcp: TCP;
    private readonly _timeoutTimer: Timer;
    private readonly _ipAddress: string;
    private readonly _logger: Logger;
    private readonly _loggerContext: string;
    private readonly _onTimeout: (handle: number) => void;
    private readonly _onReconnect: (handle: number) => void;
    private readonly _onConnectionStateChanged: (state: ConnectionState) => void;
    private readonly _port: number;
    private readonly _reconnectTimer: Timer;

    public TcpHandle: number;
    public TimoutTimerHandle: number;
    public ReconnectTimerHandle: number;
    public State: ConnectionState;

    constructor(
        ipAddress: string,
        onCommRx: (data: string, handle: number) => void,
        onConnect: (handle: number) => void,
        onDisconnect: (handle: number) => void,
        onTimeout: (handle: number) => void,
        onReconnect: (handle: number) => void,
        onConnectionStateChanged: (state: ConnectionState) => void,
        logger: Logger
    ) {
        
        this._logger = logger;
        this._loggerContext = 'DeviceConnection (' + ipAddress + ')';

        logger.logTrace('constructor', this._loggerContext);

        this._ipAddress = ipAddress;
        this._port = 3804;

        this._tcp = new TCP(onCommRx);
        this._tcp.UseHandleInCallbacks = true;
        this._tcp.OnConnectFunc = onConnect;
        this._tcp.OnDisconnectFunc = onDisconnect;

        this._timeoutTimer = new Timer();
        this._timeoutTimer.UseHandleInCallbacks = true;
        this._reconnectTimer = new Timer();
        this._reconnectTimer.UseHandleInCallbacks = true;

        this._onTimeout = onTimeout;
        this._onReconnect = onReconnect;
        this._onConnectionStateChanged = onConnectionStateChanged;

        this.State = ConnectionState.Disconnected;
        this.TcpHandle = this._tcp.Handle;
        this.TimoutTimerHandle = this._timeoutTimer.Handle;
        this.ReconnectTimerHandle = this._reconnectTimer.Handle;

        logger.logTrace('Opening TCP', this._loggerContext);
        this._tcp.Open(ipAddress, this._port);
        this._tcp.SetTxInterMsgDelay(100);
        this._timeoutTimer.Start(onTimeout, 5000);
    }

    onConnect() {
        this._logger.logTrace('onConnect', this._loggerContext);
        this.setState(ConnectionState.Connected);

        if (this._timeoutTimer.State == 1) { 
            this._timeoutTimer.Stop();
        }

        if (this._reconnectTimer.State == 1) {
            this._reconnectTimer.Stop();
        }
    }

    onDisconnect() {
        this._logger.logTrace('onDisconnect', this._loggerContext);
        this.setState(ConnectionState.Disconnected);
        this._logger.logTrace('Disconnected, reconnecting', this._loggerContext);
        this.reconnect(5000);
    }

    onTimeout() {
        this._logger.logTrace('onTimeout', this._loggerContext);
        this._logger.logTrace('TCP connection timed out, reconnecting', this._loggerContext);
        this.setState(ConnectionState.Failed);
        this.reconnect(5000);
    }

    onReconnect() {
        this._logger.logTrace('onReconnect', this._loggerContext);
        this._tcp.Open(this._ipAddress, this._port);

        if (this._timeoutTimer.State == 1) {
            this._timeoutTimer.Stop();
        }

        this._timeoutTimer.Start(this._onTimeout, 5000);
    }

    reconnect(delay: number = 0) {
        this._logger.logTrace('reconnect, delay: [' + delay + ']', this._loggerContext);

        if (this._reconnectTimer.State == 1) {
            this._reconnectTimer.Stop();
        }

        this.disconnect();

        this._logger.logTrace('starting reconnect timer', this._loggerContext);
        this._reconnectTimer.Start(this._onReconnect, delay);
    }

    sendRawCommand(command: string) {
        this._logger.logTrace('sendRawCommand (' + command + ')', this._loggerContext);

        this._tcp.Write(command);
    }
    
    private disconnect() {
        this._logger.logTrace('disconnect', this._loggerContext);

        if (this._tcp.OpenState == 1) {
            this._logger.logTrace('connection open, closing', this._loggerContext);
            this._tcp.Close();
        }

        this.setState(ConnectionState.Disconnected);
    }
    
    private setState(state: ConnectionState) {
        this._logger.logTrace('setState, state: [' + ConnectionState[state] + ']', this._loggerContext);

        if (this.State == ConnectionState.Failed && state == ConnectionState.Disconnected) { 
            // Failed state overrides Disconnected state
            this._logger.logTrace('Current connection state is faile, ignoring disconnected.', this._loggerContext);
            return;
        }

        if (state !== this.State) {
            this._logger.logTrace('Changing state to: [' + state + ']', this._loggerContext);

            this.State = state;
            this._onConnectionStateChanged(state);
        }
    }
}
