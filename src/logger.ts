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
	private readonly _prefix: string;
	public readonly IsTraceEnabled: boolean;

	constructor(prefix: string, enableTrace: boolean) {
		this.IsTraceEnabled = enableTrace;
		this._prefix = prefix;
	}

	logError(message: string, context?: string) {
		this.logInternal(MessageType.Error, message, context);
	}

	logInfo(message: string, context?: string) {
		this.logInternal(MessageType.Info, message, context);
	}

	logTrace(message: string, context?: string) {
		if (!this.IsTraceEnabled && System.LogLevel < MessageType.Trace) {
			return;
		}
		this.logInternal(MessageType.Trace, message, context);
	}

	private logInternal(messageType: MessageType, message: string, context: string = '') {
		if (this.IsTraceEnabled) {
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
