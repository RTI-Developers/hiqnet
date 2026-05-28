class DeviceConnection
{
    private static readonly CONNECT_FAILURE_TIMEOUT_MS: number = 15000;

    private readonly _ipAddress: string;
    private readonly _port: number;
    private readonly _tcp: TCP;
    private readonly _failureTimer: Timer;
    private readonly _logger: Logger;
    private readonly _loggerContext: string;
    private readonly _onFailureTick: (handle: number) => void;
    private readonly _onConnectionStateChanged: (state: ConnectionState) => void;

    public TcpHandle: number;
    public FailureTimerHandle: number;
    public State: ConnectionState;

    constructor(
        ipAddress: string,
        port: number,
        onCommRx: (data: string, handle: number) => void,
        onConnect: (handle: number) => void,
        onDisconnect: (handle: number) => void,
        onFailureTick: (handle: number) => void,
        onConnectionStateChanged: (state: ConnectionState) => void,
        logger: Logger
    ) {
        this._logger = logger;
        this._loggerContext = 'DeviceConnection (' + ipAddress + ':' + port + ')';
        this._ipAddress = ipAddress;
        this._port = port;
        this._onFailureTick = onFailureTick;
        this._onConnectionStateChanged = onConnectionStateChanged;

        this._tcp = new TCP(onCommRx);
        this._tcp.UseHandleInCallbacks = true;
        this._tcp.OnConnectFunc = onConnect;
        this._tcp.OnDisconnectFunc = onDisconnect;

        this._failureTimer = new Timer();
        this._failureTimer.UseHandleInCallbacks = true;

        this.State = ConnectionState.Disconnected;
        this.TcpHandle = this._tcp.Handle;
        this.FailureTimerHandle = this._failureTimer.Handle;
    }

    // Caller must register TcpHandle / FailureTimerHandle before invoking this so the
    // handle-bearing RTI callbacks can resolve via the routing map.
    public start() {
        this._logger.logInfo('Opening TCP connection to ' + this._ipAddress + ':' + this._port, LogInfoLevel.Low, this._loggerContext);
        this._tcp.Open(this._ipAddress, this._port);
        this._tcp.SetTxInterMsgDelay(50);
        this.armFailureTimer();
    }

    public onConnect() {
        this._logger.logInfo('onConnect', LogInfoLevel.High, this._loggerContext);
        this._failureTimer.Stop();
        this.setState(ConnectionState.Connected);
    }

    public onDisconnect() {
        // RTI's TCP object auto-reconnects after a drop unless Close() has been called.
        // We rearm the failure timer so the UI sees Failed if recovery takes too long.
        this._logger.logInfo('onDisconnect', LogInfoLevel.High, this._loggerContext);
        const wasConnected = this.State == ConnectionState.Connected;
        this.setState(ConnectionState.Disconnected);
        if (wasConnected) {
            this.armFailureTimer();
        }
    }

    public onFailureTick() {
        if (this.State != ConnectionState.Connected) {
            this._logger.logInfo('No TCP connection established within timeout; marking Failed', LogInfoLevel.Low, this._loggerContext);
            this.setState(ConnectionState.Failed);
        }
    }

    public sendRawCommand(command: string): boolean {
        if (this.State != ConnectionState.Connected) {
            this._logger.logInfo('sendRawCommand called while not connected; dropping', LogInfoLevel.Low, this._loggerContext);
            return false;
        }
        return this._tcp.Write(command);
    }

    public shutdown() {
        // Close() stops RTI's auto-reconnect loop.
        this._failureTimer.Stop();
        try { this._tcp.Close(); } catch (e) { /* swallow */ }
    }

    private armFailureTimer() {
        this._failureTimer.Stop();
        this._failureTimer.Start(this._onFailureTick, DeviceConnection.CONNECT_FAILURE_TIMEOUT_MS);
    }

    private setState(state: ConnectionState) {
        if (state == this.State) return;
        // Failed is sticky: only a real Connected event clears it.
        if (this.State == ConnectionState.Failed && state == ConnectionState.Disconnected) return;
        this._logger.logInfo('State -> ' + ConnectionState[state], LogInfoLevel.High, this._loggerContext);
        this.State = state;
        this._onConnectionStateChanged(state);
    }
}
