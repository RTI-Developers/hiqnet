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
	Ping(address: string): boolean;
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
	PDKDF2(cipher: string, password: string, iterations: number, salt: string): string;
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
	X509_OK = 0x00 /* The certificate is valid */,
	X509_BADCERT_EXPIRED = 0x01 /* The certificate validity has expired. */,
	X509_BADCERT_REVOKED = 0x02 /* The certificate has been revoked (is on a CRL). */,
	X509_BADCERT_CN_MISMATCH = 0x04 /* The certificate Common Name (CN) does not match with the expected CN. */,
	X509_BADCERT_NOT_TRUSTED = 0x08 /* The certificate is not correctly signed by the trusted CA. */,
	X509_BADCRL_NOT_TRUSTED = 0x10 /* The CRL is not correctly signed by the trusted CA. */,
	X509_BADCRL_EXPIRED = 0x20 /* The CRL is expired. */,
	X509_BADCERT_MISSING = 0x40 /* Certificate was missing. */,
	X509_BADCERT_SKIP_VERIFY = 0x80 /* Certificate verification was skipped. */,
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
	OnWebsocketUpgradeOKFunc: (httpCode: string, handle: number) => void;
	OnWebsocketUpgradeFailedFunc: (httpCode: string, handle: number) => void;
	Open(host?: string, port?: number, instance?: object, rx_buffer_size?: number): boolean;
	Close(): boolean;
	Disconnect(): boolean;
	StartSSLHandshake(): boolean;
	AddCertificateAuthority(certificate: string, mode: CertMode): boolean;
	UpgradeWebsocket(path: string): boolean;
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
	AddRxFraming(type: FramingType, stopChar: string): boolean;
	AddRxFraming(type: FramingType, startChar: string, stopChar: string): boolean;
	AddRxFraming(type: FramingType, length: number): boolean;
	AddRxHTTPFraming(): boolean;
	SetTxInterMsgDelay(delay: number);
}

interface CommConstructor {
	new (): Comm;
}

declare const Comm: CommConstructor;

interface Timer {
	readonly Interval: number;
	readonly State: number;
	readonly Handle: number;
	readonly OnTimer: (handle?: number) => void;
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
	Enabled: boolean;
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
		daysOfWeek: 'ALL' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunrise',
		sunriseType: 'On' | 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'ALL' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	Reschedule(
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunset',
		sunsetType: 'On' | 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'ALL' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
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
		daysOfWeek: 'ALL' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	new (
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunrise',
		sunriseType: 'On' | 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'ALL' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
	new (
		onEventFunc: (handle: number) => void,
		type: 'Daily',
		dailytype: 'Sunset',
		sunsetType: 'On' | 'Before' | 'After',
		offset: number,
		daysType: 'EVEN' | 'ODD' | 'BOTH',
		daysOfWeek: 'ALL' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
	): ScheduledEvent;
}

declare const ScheduledEvent: ScheduledEventConstructor;
