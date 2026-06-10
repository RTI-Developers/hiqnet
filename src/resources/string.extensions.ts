interface String {
    cleanHex(): string,
    padLeft(size: number): string;
    replaceAll(search: string, replacement: string): string;
    toHexByteArray(): string[];
}

String.prototype.cleanHex = function(this: string): string {
    return this.replaceAll(',', '').replaceAll(' ', '');
};

String.prototype.padLeft = function(this: string, size: number): string {
    let result = this;
    while (result.length < size) {
        result = '0' + result;
    }
    return result;
};

String.prototype.replaceAll = function(this: string, search: string, replacement: string) {
    return this.replace(new RegExp(search, 'g'), replacement);
};

String.prototype.toHexByteArray = function(this: string) : string[] {
    const out: string[] = [];
    for (let i = 0; i < this.length; i++) {
        const b = this.charCodeAt(i) & 0xFF;
        out.push((b < 16 ? '0' : '') + b.toString(16));
    }
    return out;
};
