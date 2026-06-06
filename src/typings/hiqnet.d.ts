// ============================================================
// HiQNet Protocol Type Declarations
// ============================================================

// ── Data type identifiers (HiQNet spec section 3) ───────────

declare const HQ_BYTE: 0;
declare const HQ_UBYTE: 1;
declare const HQ_WORD: 2;
declare const HQ_UWORD: 3;
declare const HQ_LONG: 4;
declare const HQ_ULONG: 5;
declare const HQ_FLOAT32: 6;
declare const HQ_FLOAT64: 7;
declare const HQ_BLOCK: 8;
declare const HQ_STRING: 9;
declare const HQ_LONG64: 10;
declare const HQ_ULONG64: 11;

// ── Message ID constants (HiQNet spec section 8) ───────────

declare const MSGID_DISCO_INFO: '0000';
declare const MSGID_GET_ATTRIBUTES: '010d';
declare const MSGID_GET_VD_LIST: '011a';
declare const MSGID_GOODBYE: '0007';
declare const MSGID_HELLO: '0008';
declare const MSGID_MULTI_OBJECT_PARAM_SET: '0101';
declare const MSGID_MULTI_PARAM_GET: '0103';
declare const MSGID_MULTI_PARAM_SET: '0100';
declare const MSGID_MULTI_PARAM_SET_PERCENT: '0102';
declare const MSGID_MULTI_PARAM_SUBSCRIBE: '010f';
declare const MSGID_MULTI_PARAM_UNSUBSCRIBE: '0112';
declare const MSGID_PARAM_SUBSCRIBE_PERCENT: '0111';

// ── Protocol flag bits ──────────────────────────────────────

declare const FLAG_INFORMATION: 0x0004;
declare const FLAG_GUARANTEED: 0x0020;
declare const FLAG_REQUEST_ACK: 0x0001;

// ── Default address constants ───────────────────────────────

declare const DEFAULT_GATEWAY_ADDRESS: '00000000';
declare const DEFAULT_OBJECT_ID: '000000';
declare const DEFAULT_VIRTUAL_DEVICE_ADDRESS: '00';

// ── Other constants ─────────────────────────────────────────

declare const HOP_COUNT: '05';
declare const SERIAL_NUMBER_LENGTH: '0010';  // serial number payload is 16 bytes per spec
declare const MAX_MESSAGE_SIZE: '00100000'; // Per spec, but also a common Ethernet MTU size to avoid fragmentation.
declare const ETHERNET_NETWORK_ID: '01';  // Ethernet network ID
declare const DHCP_STATIC_IDENTIFIER: '00';  // Static address identifier
declare const STD_HEADER_LEN: 25;

// ── Core types ──────────────────────────────────────────────

type ParamSetMethod = 'Set' | 'Set %';
type VariableType = 'Boolean' | 'Integer' | 'String';

interface Parameter {
	DataType: string;
	Id: string;
	Index: number;
	IsSetAllowed: boolean;
	IsSubscribeEnabled: boolean;
	Name: string;
	ObjectAddress: string;
	SetMethod: ParamSetMethod;
	VariableType: VariableType;
}

interface ParamUpdate {
	parameter: Parameter | null;
	paramId: string;
	dataType: number;
	valueHex: string;
}

interface ConsumedParamBlock {
	newPos: number;
	updates: ParamUpdate[];
}

// ── Payload config types ────────────────────────────────────

interface DiscoInfoConfig {
	sourceDeviceAddress: string;
	sourceMacAddress: string;
	sourceSerialNumber: string;
	controllerIpHex: string;
	controllerNetMask: string;
}

interface HeaderConfig {
	sourceAddress: string;
	destAddress: string;
	messageId: string;
	payloadByteLen: number;
	flagsBits: number;
	protocolVersionHex: string;
	headerLenBytes?: number;
}
