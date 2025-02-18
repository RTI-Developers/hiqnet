class GlobalHandlerMap<T> {
    private readonly _handlesToValues: { [handle: string]: T; } = {};

    count: number = 0;

    getMappedValueFromHandle(handle: number): T | null {
        if (handle.toString() in this._handlesToValues) {
            return this._handlesToValues[handle.toString()];
        } else {
            return null;
        }
    }

    register(handle: number, mappedValue: T) {
        this._handlesToValues[handle.toString()] = mappedValue;
        this.count++;
    }

    remove(handle: number) {
        delete this._handlesToValues[handle.toString()];
        this.count--;
    }
}