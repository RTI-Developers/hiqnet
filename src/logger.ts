// System LogLevels
//  Off = 0,
//  Low = 1,
//  Medium = 2,
//  High = 3

enum MessageType {
	Error = 1,
	Info = 2,
	Trace = 3,
}

class Logger {
	private readonly _enableTrace: boolean;
	private readonly _prefix: string;

	constructor(prefix: string, enableTrace: boolean) {
		this._enableTrace = enableTrace;
		this._prefix = prefix;
	}

	logError(message: string, context?: string) {
		this.logInternal(MessageType.Error, message, context);
	}

	logInfo(message: string, context?: string) {
		this.logInternal(MessageType.Info, message, context);
	}

	logTrace(message: string, context?: string) {
		this.logInternal(MessageType.Trace, message, context);
	}

	private logInternal(messageType: MessageType, message: string, context: string = '') {
		if (this._enableTrace) {
			let traceMessage = this._prefix + ' [' + MessageType[messageType] + '] ';

			if (context) {
				traceMessage += 'Context: [' + context + ']';
			}

			traceMessage += ' - ' + message;

			System.PrintMultiline(traceMessage);
		}

		if (System.LogLevel >= messageType) {
			System.LogInfo(messageType, message);
		}
	}
}
