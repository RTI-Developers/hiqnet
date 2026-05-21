/// <reference path="./lib/js17.d.ts" />

/////////////////////////////
/// RTI XP Driver SDK — TypeScript typings
///
/// SDK reference: RTI XP Driver Developer's Guide, script engine version 25
/// Typings revision: 2
/////////////////////////////

interface ConfigStatic {
	Get(name: string): string;
}

declare const Config: ConfigStatic;

interface SystemStatic {
	readonly Version: string;
	OnShutdownFunc: () => void | null;
	readonly IPAddress: string;
	readonly MACAddress: string;
	readonly LogLevel: number;
	readonly IPNetMask: string;
	Print(msg: string): boolean;
	PrintMultiline(msg: string): boolean;
	Sleep(time: number): boolean;
	GetURL(url: string): string;
	ConvertFromUTF8(utf8_string: string): string;
	ConvertToUTF8(unicode_string: string): string;
	RunSystemMacro(macro: number): boolean;
	SignalEvent(name: string): boolean;
	SetPriority(priority: number): boolean;
	StartUPnPScan(searchTarget?: string): boolean;
	GetLocalTime(): string;
	GetUTCTime(): string;
	GetLocalTimeInSeconds(): number;
	GetUTCTimeInSeconds(): number;
	Compress(data: string): string;
	Uncompress(data: string, outputSize: number): string;
	GetRandomInteger(low_range: number, high_range: number): number;
	LogError(msg: string): boolean;
	LogInfo(level: number, msg: string): boolean;
	GetViewName(view: number): string;
	LoadResource(resource: string): string;
	/** @deprecated Use the Ping object instead (script engine v20+) */
	Ping(address: string): boolean;
	GetTickCount(): number;
}

declare const System: SystemStatic;

interface PersistenceStatic {
	Write(key: string, value: string): boolean;
	Read(key: string): string;
	Delete(key?: string): boolean;
	Save(): boolean;
}

declare const Persistence: PersistenceStatic;

type HashType = 'MD5' | 'SHA1' | 'SHA224' | 'SHA256' | 'SHA384' | 'SHA512' | 'RIPEMD160';

interface CryptoStatic {
	readonly Engine: string;
	RSAGenerateKey(bits: number): string;
	RSASign(privatekey: string, hashtype: HashType | 'NONE', data: string, length: number): string;
	RSAVerify(
		publickey: string,
		hashtype: HashType | 'NONE',
		hash: string,
		hashlength: number,
		signature: string,
		signaturelength: number
	): boolean;
	Hash(digest: HashType, data: string, length: number): string;
	Base64Encode(data: string, length: number): string;
	Base64Decode(data: string, length: number): string;
	RSAEncrypt(publickey: string, data: string, length: number): string;
	RSADecrypt(privatekey: string, data: string, length: number): string;
	GenerateRandomBitstream(bytes: number): string;
	AESEncrypt(data: string, length: number, key: string, iv: string, cipher?: number, padding?: number): string;
	AESDecrypt(data: string, length: number, key: string, iv: string, cipher?: number, padding?: number): string;
	PBKDF2(cipher: string, password: string, iterations: number, salt: string): string;
	ChaCha20Poly1305Decrypt(key: string, nonce: string, data: string, tag?: string): string;
	Argon2(hashtype: string, password: string, salt: string, opslimit: number, memlimit: number, size: number): string;
}

declare const Crypto: CryptoStatic;

interface TCP extends Comm {
	readonly OpenState: number;
	OnConnectFunc: (handle: number) => void;
	OnDisconnectFunc: (handle: number) => void;
	readonly ConnectState: number;
	Open(host?: string, port?: number, instance?: object, rx_buffer_size?: number): boolean;
	Close(): boolean;
}

interface TCPConstructor {
	new (
		onCommRx: (data: string, handle: number) => void,
		host?: string,
		port?: number,
		instance?: object,
		rx_buffer_size?: number
	): TCP;
}

declare const TCP: TCPConstructor;

declare enum CertReason {
    X509_OK = 0x00,  /* The certificate is valid */
    X509_BADCERT_EXPIRED = 0x01,  /* The certificate validity has expired. */
    X509_BADCERT_REVOKED = 0x02,  /* The certificate has been revoked (is on a CRL). */
    X509_BADCERT_CN_MISMATCH = 0x04,  /* The certificate Common Name (CN) does not match with the expected CN. */
    X509_BADCERT_NOT_TRUSTED = 0x08,  /* The certificate is not correctly signed by the trusted CA. */
    X509_BADCRL_NOT_TRUSTED = 0x10,  /* The CRL is not correctly signed by the trusted CA. */
    X509_BADCRL_EXPIRED =  0x20,  /* The CRL is expired. */
    X509_BADCERT_MISSING = 0x40,  /* Certificate was missing. */
    X509_BADCERT_SKIP_VERIFY = 0x80  /* Certificate verification was skipped. */
}

declare enum CertMode {
	Append = 1,
	Replace = 2,
}

interface HTTP extends Comm {
	readonly OpenState: number;
	OnConnectFunc: (handle: number) => void;
	OnConnectFailedFunc: (handle: number) => void;
	OnDisconnectFunc: (handle: number) => void;
	OnSSLHandshakeOKFunc: (handle: number, reason: CertReason) => void;
	OnSSLHandshakeFailedFunc: (handle: number) => void;
	readonly ConnectState: number;
	SSLHandshakeTimeout: number;
	OnWebsocketUpgradeOKFunc: (httpCode: number, handle?: number) => void;
	OnWebsocketUpgradeFailedFunc: (httpCode: number, handle?: number) => void;
	OnWebsocketPingFunc: (handle?: number) => void;
	Open(host?: string, port?: number, instance?: object, rx_buffer_size?: number): boolean;
	Close(): boolean;
	Disconnect(): boolean;
	StartSSLHandshake(): boolean;
	AddCertificateAuthority(certificate: string, mode: CertMode): boolean;
	LoadClientCertificate(certificate: string, key: string, password?: string): boolean;
	UpgradeWebsocket(path?: string): boolean;
	WebsocketAddHeader(name: string, value: string): boolean;
}

interface HTTPConstructor {
	new (onCommRx: (data: string, handle: number) => void, host?: string, port?: number, rx_buffer_size?: number): HTTP;
}

declare const HTTP: HTTPConstructor;

type FramingType = 'StopChar' | 'StartStopChar' | 'FixedLength';

interface Comm {
	readonly TxQueueDepth: number;
	readonly Handle: number;
	UseHandleInCallbacks: boolean;
	readonly HeartbeatConnectState: boolean;
	Write(data: string, rxtimeout?: number): boolean;
	Read(timeout: number): string;
	WaitForRx(timeout: number): boolean;
	AddRxFraming(type: FramingType, stopChar: string): boolean;
	AddRxFraming(type: FramingType, startChar: string, stopChar: string): boolean;
	AddRxFraming(type: FramingType, length: number): boolean;
	AddRxHTTPFraming(): boolean;
	SetTxInterMsgDelay(delay: number): boolean;
	EnableHeartbeat(interval: number, sendheartbeatfunc: (handle?: number) => void, onconnectfunc: (handle?: number) => void, ondisconnectfunc: (handle?: number) => void): boolean;
	HeartbeatReceived(): boolean;
}

interface CommConstructor {
	new (): Comm;
}

declare const Comm: CommConstructor;

interface Timer {
	readonly Interval: number;
	readonly State: number;
	readonly Handle: number;
	UseHandleInCallbacks: boolean;
	Start(onTimerFunc: (handle: number) => void, timeout: number): boolean;
	Stop(): boolean;
}

interface TimerConstructor {
	new (): Timer;
}

declare const Timer: TimerConstructor;

interface SystemVarsStatic {
	OnSysVarChangeFunc: (variableid: number) => void | null;
	Write(varname: string, data: any, option?: string): boolean;
	Read(varname: string | number): any;
	AddSubscription(id: number): boolean;
	RemoveSubscription(id: number): boolean;
}

declare const SystemVars: SystemVarsStatic;

interface SystemVarsList<T> {
	readonly Size: number;
	readonly MarkedCount: number;
	OnScrollInfoFunc: (view, highlight, top) => void;
	Open: () => boolean;
	Insert: (data: T) => boolean;
	InsertWithImage: (data: string, url: string) => boolean;
	InsertAt: (index: number, data: T) => boolean;
	ReadAt: (index: number) => T;
	ModifyAt: (index: number, data: T) => boolean;
	RemoveAll: () => boolean;
	RemoveAt: (index: number) => boolean;
	SetMarked: (index: number) => boolean;
	AddMarked: (index: number) => boolean;
	RemoveMarked: (index: number) => boolean;
	IsMarked: (index: number) => boolean;
	GetMarked: (index: number) => number;
	SetIndexes: (selIndex: number, windowTopIndex: number) => boolean;
	Close: () => boolean;
}

interface SystemVarsListConstructor {
	new <T>(varname: string): SystemVarsList<T>;
}

declare const SystemVarsList: SystemVarsListConstructor;

interface ScheduledEvent {
	readonly Enabled: boolean;
	readonly Handle: number;
	UseHandleInCallbacks: boolean;
	Disable(): boolean;
	Enable(): boolean;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Periodic',
		intervalType: 'Minutes' | 'Seconds',
		interval: number
	): ScheduledEvent;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'TimeOfDay',
		timeOfDay: string,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunrise',
		sunriseType: 'On',
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunrise',
		sunriseType: 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunset',
		sunsetType: 'On',
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunset',
		sunsetType: 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
}

interface ScheduledEventConstructor {
	new (
		onEventFunc: (handle: number) => void,
		type: 'Periodic',
		intervalType: 'Minutes' | 'Seconds',
		interval: number
	): ScheduledEvent;
	new (
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'TimeOfDay',
		timeOfDay: string,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	new (
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunrise',
		sunriseType: 'On',
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	new (
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunrise',
		sunriseType: 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	new (
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunset',
		sunsetType: 'On',
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	new (
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunset',
		sunsetType: 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'All' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
}

declare const ScheduledEvent: ScheduledEventConstructor;

interface Serial extends Comm {
	OnOneWayTxFunc: ((data: string, handle?: number) => void) | null;
}

interface SerialConstructor {
	new (
		rxfunc: (data: string, handle?: number) => void,
		port: number,
		baudrate: 115200 | 57600 | 38400 | 19200 | 9600 | 4800 | 2400 | 1200 | 600 | 300,
		databits: 5 | 6 | 7 | 8,
		stopbits: 1 | 2,
		parity: 'None' | 'Odd' | 'Even' | 'Mark' | 'Space',
		handshaking: 'None' | 'RTS' | 'DTR',
		instance?: object
	): Serial;
}

declare const Serial: SerialConstructor;

interface TCPServer {
	readonly Port: number;
	OnClientConnectFunc: (fromaddr: string, channel: number, handle?: number) => void;
	OnClientDisconnectFunc: (channel: number, handle?: number) => void;
	Listen(profilename: 'UPnPEventServer'): boolean;
	Listen(profilename: 'GenericServer', port: number): boolean;
	Write(channel: number, data: string, rxtimeout?: number): boolean;
	CloseChannel(channel: number): boolean;
}

interface TCPServerConstructor {
	new (rxfunc: (channel: number, data: string, handle?: number) => void): TCPServer;
}

declare const TCPServer: TCPServerConstructor;

interface UDP extends Comm {
	WriteToAddress(host: string, port: number, data: string): boolean;
}

interface UDPConstructor {
	new (
		rxfunc: (data: string, handle?: number) => void,
		host: string,
		port: number,
		instance?: object
	): UDP;
}

declare const UDP: UDPConstructor;

interface MulticastUDP extends Comm {
	Enabled: boolean;
	AddFilter(filter: string): boolean;
	RemoveFilter(filter: string): boolean;
	RemoveAllFilters(): boolean;
}

interface MulticastUDPConstructor {
	new (
		rxfunc: (fromaddr: string, fromport: number, data: string, handle?: number) => void,
		group: string,
		port?: number
	): MulticastUDP;
}

declare const MulticastUDP: MulticastUDPConstructor;

interface UtilStatic {
	toString(data: string, length: number, format: 'HEXSTRINGLOWER' | 'HEXSTRINGUPPER' | 'HEXDUMPLOWER' | 'HEXDUMPUPPER', width?: number): string;
}

declare const Util: UtilStatic;

interface PingObject {
	Timeout: number;
	readonly Count: number;
	UseHandleInCallbacks: boolean;
	OnPingOKFunc: (address: string, duration: number, handle?: number) => void;
	OnPingFailedFunc: (address: string, reason: number, handle?: number) => void;
	OnPingCompleteFunc: (handle?: number) => void;
	Add(address: string): boolean;
	Clear(): boolean;
	Start(): boolean;
	Stop(): boolean;
}

interface PingConstructor {
	new (
		onPingOK: (address: string, duration: number, handle?: number) => void,
		onPingFailed: (address: string, reason: number, handle?: number) => void,
		onPingComplete: (handle?: number) => void
	): PingObject;
}

declare const Ping: PingConstructor;

interface SSH extends Comm {
	readonly OpenState: number;
	OnConnectFunc: (handle?: number) => void;
	OnConnectFailedFunc: (handle?: number) => void;
	OnDisconnectFunc: (handle?: number) => void;
	OnHandshakeOKFunc: (fingerprint: string, methods: string, handle?: number) => void;
	OnHandshakeFailedFunc: (handle?: number) => void;
	OnAuthenticationOKFunc: (handle?: number) => void;
	OnAuthenticationFailedFunc: (handle?: number) => void;
	Open(host: string, port?: number, rx_buffer_size?: number): boolean;
	Close(): boolean;
	Disconnect(): boolean;
	StartHandshake(): boolean;
	AuthenticatePassword(password: string): void;
	AuthenticatePublicKey(privatekey: string, privatekeypassword?: string): void;
	AddPromptResponse(prompt: string, response: string): void;
	AuthenticateKeyboardInteractive(): void;
}

interface SSHConstructor {
	new (
		rxfunc: (data: string, handle?: number) => void,
		host?: string,
		port?: number,
		rx_buffer_size?: number
	): SSH;
}

declare const SSH: SSHConstructor;

interface MDNS extends Comm {
	Timeout: number;
	Discover(type: string): boolean;
}

interface MDNSConstructor {
	new (
		onDiscoverFunc: (json: string, handle?: number) => void,
		onCompleteFunc: (handle?: number) => void
	): MDNS;
}

declare const MDNS: MDNSConstructor;
