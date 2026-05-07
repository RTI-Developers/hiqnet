class DeviceConnection
{
    private readonly _tcp: TCP;
    private readonly _timeoutTimer: Timer;
    private readonly _logger: Logger;
    private readonly _loggerContext: string;
    private readonly _onTimeout: (handle: number) => void;
    private readonly _onConnectionStateChanged: (state: ConnectionState) => void;

    public TcpHandle: number;
    public TimoutTimerHandle: number;
    public State: ConnectionState;

    constructor(
        ipAddress: string,
        onCommRx: (data: string, handle: number) => void,
        onConnect: (handle: number) => void,
        onDisconnect: (handle: number) => void,
        onTimeout: (handle: number) => void,
        onConnectionStateChanged: (state: ConnectionState) => void,
        logger: Logger
    ) {
        
        this._logger = logger;
        this._loggerContext = 'DeviceConnection (' + ipAddress + ')';

        logger.logTrace('constructor', this._loggerContext);

        this._tcp = new TCP(onCommRx);
        this._tcp.UseHandleInCallbacks = true;
        this._tcp.OnConnectFunc = onConnect;
        this._tcp.OnDisconnectFunc = onDisconnect;

        this._timeoutTimer = new Timer();
        this._timeoutTimer.UseHandleInCallbacks = true;

        this._onTimeout = onTimeout;
        this._onConnectionStateChanged = onConnectionStateChanged;

        this.State = ConnectionState.Disconnected;
        this.TcpHandle = this._tcp.Handle;
        this.TimoutTimerHandle = this._timeoutTimer.Handle;

        logger.logTrace('Opening TCP Connection to: [' + ipAddress + ':3804]', this._loggerContext);
        this._tcp.Open(ipAddress, 3804);
        this._tcp.SetTxInterMsgDelay(100);
        this._timeoutTimer.Start(onTimeout, 5000);
    }

    onConnect() {
        this._logger.logTrace('onConnect', this._loggerContext);
        this.setState(ConnectionState.Connected);

        if (this._timeoutTimer.State == 1) { 
            this._timeoutTimer.Stop();
        }
    }

    onDisconnect() {
        this._logger.logTrace('onDisconnect', this._loggerContext);
        this.setState(ConnectionState.Disconnected);
        this._logger.logTrace('Disconnected', this._loggerContext);
        
        if (this._timeoutTimer.State != 1) {
            this._timeoutTimer.Start(this._onTimeout, 5000);
        }
    }

    onTimeout() {
        this._logger.logTrace('onTimeout', this._loggerContext);
        this._logger.logTrace('TCP connection timed out', this._loggerContext);
        this.setState(ConnectionState.Failed);
        this._timeoutTimer.Start(this._onTimeout, 5000);
    }

    sendRawCommand(command: string) {
        this._logger.logTrace('sendRawCommand (' + command + ')', this._loggerContext);

        this._tcp.Write(command);
    }
    
    private setState(state: ConnectionState) {
        this._logger.logTrace('setState, state: [' + ConnectionState[state] + ']', this._loggerContext);

        if (this.State == ConnectionState.Failed && state == ConnectionState.Disconnected) { 
            // Failed state overrides Disconnected state
            this._logger.logTrace('Current connection state is failed, ignoring disconnected.', this._loggerContext);
            return;
        }

        if (state !== this.State) {
            this._logger.logTrace('Changing state to: [' + state + ']', this._loggerContext);

            this.State = state;
            this._onConnectionStateChanged(state);
        }
    }
}
