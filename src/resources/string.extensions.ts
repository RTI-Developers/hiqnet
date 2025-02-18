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
    return this.split('').map(x => x.charCodeAt(0).toString(16).padLeft(2));
};
