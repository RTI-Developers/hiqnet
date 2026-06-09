// ============================================================
// HiQNet Protocol Type Declarations
// ============================================================

// ── Core types ──────────────────────────────────────────────

type ParamSetMethod = 'Set' | 'Set %';
type VariableType = 'Boolean' | 'Integer' | 'String';

interface Parameter {
	DataType: HiQnetDataType;
	Id: string;
	Index: number;
	IsSetAllowed: boolean;
	IsSubscribeEnabled: boolean;
	Name: string;
	ObjectAddress: string;
	SetMethod: ParamSetMethod;
	VariableType: VariableType;
}

interface HiQnetMessage {
	Flags: number;
	HeaderLengthBytes: number;
	MessageId: HiQnetMessageId;
	Payload: string;
	SeqNum: number;
	SourceAddress: string;
	TotalLengthBytes: number;
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
