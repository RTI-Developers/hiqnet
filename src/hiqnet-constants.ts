// ============================================================
// HiQNet Protocol Runtime Enums
// ============================================================

enum HiQnetDataType {
	HQ_BYTE = 0,
	HQ_UBYTE = 1,
	HQ_WORD = 2,
	HQ_UWORD = 3,
	HQ_LONG = 4,
	HQ_ULONG = 5,
	HQ_FLOAT32 = 6,
	HQ_FLOAT64 = 7,
	HQ_BLOCK = 8,
	HQ_STRING = 9,
	HQ_LONG64 = 10,
	HQ_ULONG64 = 11
}

enum HiQnetMessageId {
	DISCO_INFO = 0,
	GET_ATTRIBUTES = 269,
	GET_VD_LIST = 282,
	GOODBYE = 7,
	HELLO = 8,
	MULTI_OBJECT_PARAM_SET = 257,
	MULTI_PARAM_GET = 259,
	MULTI_PARAM_SET = 256,
	MULTI_PARAM_SET_PERCENT = 258,
	MULTI_PARAM_SUBSCRIBE = 271,
	MULTI_PARAM_UNSUBSCRIBE = 274,
	PARAM_SUBSCRIBE_PERCENT = 273
}

// ============================================================
// HiQnet Protocol Runtime Constants
// ============================================================

// ── Protocol flag bits ──────────────────────────────────────

const FLAG_INFORMATION: number = 0x0004;
const FLAG_GUARANTEED: number = 0x0020;
const FLAG_REQUEST_ACK: number = 0x0001;

// ── Default address constants ───────────────────────────────

const DEFAULT_GATEWAY_ADDRESS: string = '00000000';
const DEFAULT_OBJECT_ID: string = '000000';
const DEFAULT_VIRTUAL_DEVICE_ADDRESS: string = '00';

// ── Other constants ─────────────────────────────────────────

const BROADCAST_ADDRESS: string = 'FFFF00000000';  // per HiQnet spec s.8.7
const DHCP_STATIC_IDENTIFIER: string = '00';       // Static address identifier
const ETHERNET_NETWORK_ID: string = '01';            // Ethernet network ID
const HOP_COUNT: string = '05';
const MAX_MESSAGE_SIZE: string = '00100000';         // Per spec / common Ethernet MTU
const SERIAL_NUMBER_LENGTH: string = '0010';          // serial number payload is 16 bytes per spec
const STD_HEADER_LEN: number = 25;
const ZERO_IP_ADDRESS: string = '00000000';