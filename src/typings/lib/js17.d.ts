/// <reference no-default-lib="true"/>

/////////////////////////////
/// Mozilla JavaScript 1.7 / SpiderMonkey (pre-ES5)
///
/// Reflects the RTI processor's embedded SpiderMonkey engine, confirmed via
/// runtime probing. The engine predates ES5 (2009) and corresponds to the
/// Mozilla JavaScript 1.7 specification (Firefox 2 era, ~2006).
///
/// Present (ES3 baseline + Mozilla JS 1.6 array extras + SpiderMonkey extensions):
///   Array.prototype — indexOf / lastIndexOf / every / some / forEach / map / filter
///   Date            — now()
///
/// Absent (not available on RTI processors — do not use):
///   Array.prototype — reduce / reduceRight
///   Array           — isArray
///   String          — trim / trimStart / trimEnd
///   Object          — create / defineProperty / defineProperties / getPrototypeOf /
///                     getOwnPropertyDescriptor / getOwnPropertyNames / keys /
///                     seal / freeze / preventExtensions / isSealed / isFrozen / isExtensible
///   Function        — bind
///   JSON            — not native; provided by json2.js shim (see json2.d.ts)
///   Symbol, Promise, Proxy, Reflect, typed arrays — not present
/////////////////////////////

declare var NaN: number;
declare var Infinity: number;

declare function eval(x: string): any;
declare function parseInt(string: string, radix?: number): number;
declare function parseFloat(string: string): number;
declare function isNaN(number: number): boolean;
declare function isFinite(number: number): boolean;
declare function decodeURI(encodedURI: string): string;
declare function decodeURIComponent(encodedURIComponent: string): string;
declare function encodeURI(uri: string): string;
declare function encodeURIComponent(uriComponent: string | number | boolean): string;
/** @deprecated */
declare function escape(string: string): string;
/** @deprecated */
declare function unescape(string: string): string;

interface PropertyDescriptor {
    configurable?: boolean;
    enumerable?: boolean;
    value?: any;
    writable?: boolean;
    get?(): any;
    set?(v: any): void;
}

interface Object {
    constructor: Function;
    toString(): string;
    toLocaleString(): string;
    valueOf(): Object;
    hasOwnProperty(v: string): boolean;
    isPrototypeOf(v: Object): boolean;
    propertyIsEnumerable(v: string): boolean;
}

interface ObjectConstructor {
    new (value?: any): Object;
    (): any;
    (value: any): any;
    readonly prototype: Object;
}

declare var Object: ObjectConstructor;

interface Function {
    apply(this: Function, thisArg: any, argArray?: any): any;
    call(this: Function, thisArg: any, ...argArray: any[]): any;
    toString(): string;
    prototype: any;
    readonly length: number;
    arguments: any;
    caller: Function;
}

interface FunctionConstructor {
    new (...args: string[]): Function;
    (...args: string[]): Function;
    readonly prototype: Function;
}

declare var Function: FunctionConstructor;

interface IArguments {
    [index: number]: any;
    length: number;
    callee: Function;
}

interface String {
    toString(): string;
    charAt(pos: number): string;
    charCodeAt(index: number): number;
    concat(...strings: string[]): string;
    indexOf(searchString: string, position?: number): number;
    lastIndexOf(searchString: string, position?: number): number;
    localeCompare(that: string): number;
    match(regexp: string | RegExp): RegExpMatchArray | null;
    replace(searchValue: string | RegExp, replaceValue: string): string;
    replace(searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string;
    search(regexp: string | RegExp): number;
    slice(start?: number, end?: number): string;
    split(separator: string | RegExp, limit?: number): string[];
    substring(start: number, end?: number): string;
    toLowerCase(): string;
    toLocaleLowerCase(): string;
    toUpperCase(): string;
    toLocaleUpperCase(): string;
    /** @deprecated */
    substr(from: number, length?: number): string;
    valueOf(): string;
    readonly length: number;
    readonly [index: number]: string;
}

interface StringConstructor {
    new (value?: any): String;
    (value?: any): string;
    readonly prototype: String;
    fromCharCode(...codes: number[]): string;
}

declare var String: StringConstructor;

interface Boolean {
    valueOf(): boolean;
}

interface BooleanConstructor {
    new (value?: any): Boolean;
    <T>(value?: T): boolean;
    readonly prototype: Boolean;
}

declare var Boolean: BooleanConstructor;

interface Number {
    toString(radix?: number): string;
    toFixed(fractionDigits?: number): string;
    toExponential(fractionDigits?: number): string;
    toPrecision(precision?: number): string;
    valueOf(): number;
}

interface NumberConstructor {
    new (value?: any): Number;
    (value?: any): number;
    readonly prototype: Number;
    readonly MAX_VALUE: number;
    readonly MIN_VALUE: number;
    readonly NaN: number;
    readonly NEGATIVE_INFINITY: number;
    readonly POSITIVE_INFINITY: number;
}

declare var Number: NumberConstructor;

interface Math {
    readonly E: number;
    readonly LN10: number;
    readonly LN2: number;
    readonly LOG2E: number;
    readonly LOG10E: number;
    readonly PI: number;
    readonly SQRT1_2: number;
    readonly SQRT2: number;
    abs(x: number): number;
    acos(x: number): number;
    asin(x: number): number;
    atan(x: number): number;
    atan2(y: number, x: number): number;
    ceil(x: number): number;
    cos(x: number): number;
    exp(x: number): number;
    floor(x: number): number;
    log(x: number): number;
    max(...values: number[]): number;
    min(...values: number[]): number;
    pow(x: number, y: number): number;
    random(): number;
    round(x: number): number;
    sin(x: number): number;
    sqrt(x: number): number;
    tan(x: number): number;
}

declare var Math: Math;

interface Date {
    toString(): string;
    toDateString(): string;
    toTimeString(): string;
    toLocaleString(): string;
    toLocaleDateString(): string;
    toLocaleTimeString(): string;
    valueOf(): number;
    getTime(): number;
    getFullYear(): number;
    getUTCFullYear(): number;
    getMonth(): number;
    getUTCMonth(): number;
    getDate(): number;
    getUTCDate(): number;
    getDay(): number;
    getUTCDay(): number;
    getHours(): number;
    getUTCHours(): number;
    getMinutes(): number;
    getUTCMinutes(): number;
    getSeconds(): number;
    getUTCSeconds(): number;
    getMilliseconds(): number;
    getUTCMilliseconds(): number;
    getTimezoneOffset(): number;
    setTime(time: number): number;
    setMilliseconds(ms: number): number;
    setUTCMilliseconds(ms: number): number;
    setSeconds(sec: number, ms?: number): number;
    setUTCSeconds(sec: number, ms?: number): number;
    setMinutes(min: number, sec?: number, ms?: number): number;
    setUTCMinutes(min: number, sec?: number, ms?: number): number;
    setHours(hours: number, min?: number, sec?: number, ms?: number): number;
    setUTCHours(hours: number, min?: number, sec?: number, ms?: number): number;
    setDate(date: number): number;
    setUTCDate(date: number): number;
    setMonth(month: number, date?: number): number;
    setUTCMonth(month: number, date?: number): number;
    setFullYear(year: number, month?: number, date?: number): number;
    setUTCFullYear(year: number, month?: number, date?: number): number;
    toUTCString(): string;
}

interface DateConstructor {
    new (): Date;
    new (value: number | string): Date;
    new (year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date;
    (): string;
    readonly prototype: Date;
    parse(s: string): number;
    UTC(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): number;
    now(): number;
}

declare var Date: DateConstructor;

interface RegExpMatchArray extends Array<string> {
    index?: number;
    input?: string;
    0: string;
}

interface RegExpExecArray extends Array<string> {
    index: number;
    input: string;
    0: string;
}

interface RegExp {
    exec(string: string): RegExpExecArray | null;
    test(string: string): boolean;
    readonly source: string;
    readonly global: boolean;
    readonly ignoreCase: boolean;
    readonly multiline: boolean;
    lastIndex: number;
}

interface RegExpConstructor {
    new (pattern: RegExp | string): RegExp;
    new (pattern: string, flags?: string): RegExp;
    (pattern: RegExp | string): RegExp;
    (pattern: string, flags?: string): RegExp;
    readonly prototype: RegExp;
}

declare var RegExp: RegExpConstructor;

interface Error {
    name: string;
    message: string;
    stack?: string;
}

interface ErrorConstructor {
    new (message?: string): Error;
    (message?: string): Error;
    readonly prototype: Error;
}

declare var Error: ErrorConstructor;

interface EvalError extends Error {}
interface EvalErrorConstructor extends ErrorConstructor {
    new (message?: string): EvalError;
    (message?: string): EvalError;
    readonly prototype: EvalError;
}
declare var EvalError: EvalErrorConstructor;

interface RangeError extends Error {}
interface RangeErrorConstructor extends ErrorConstructor {
    new (message?: string): RangeError;
    (message?: string): RangeError;
    readonly prototype: RangeError;
}
declare var RangeError: RangeErrorConstructor;

interface ReferenceError extends Error {}
interface ReferenceErrorConstructor extends ErrorConstructor {
    new (message?: string): ReferenceError;
    (message?: string): ReferenceError;
    readonly prototype: ReferenceError;
}
declare var ReferenceError: ReferenceErrorConstructor;

interface SyntaxError extends Error {}
interface SyntaxErrorConstructor extends ErrorConstructor {
    new (message?: string): SyntaxError;
    (message?: string): SyntaxError;
    readonly prototype: SyntaxError;
}
declare var SyntaxError: SyntaxErrorConstructor;

interface TypeError extends Error {}
interface TypeErrorConstructor extends ErrorConstructor {
    new (message?: string): TypeError;
    (message?: string): TypeError;
    readonly prototype: TypeError;
}
declare var TypeError: TypeErrorConstructor;

interface URIError extends Error {}
interface URIErrorConstructor extends ErrorConstructor {
    new (message?: string): URIError;
    (message?: string): URIError;
    readonly prototype: URIError;
}
declare var URIError: URIErrorConstructor;

/////////////////////////////
/// Array — confirmed present on RTI: indexOf, lastIndexOf, every, some,
///          forEach, map, filter
/// Confirmed absent: reduce, reduceRight, isArray
/////////////////////////////

interface ReadonlyArray<T> {
    readonly length: number;
    toString(): string;
    toLocaleString(): string;
    concat(...items: ConcatArray<T>[]): T[];
    concat(...items: (T | ConcatArray<T>)[]): T[];
    join(separator?: string): string;
    slice(start?: number, end?: number): T[];
    indexOf(searchElement: T, fromIndex?: number): number;
    lastIndexOf(searchElement: T, fromIndex?: number): number;
    every(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown, thisArg?: any): boolean;
    some(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown, thisArg?: any): boolean;
    forEach(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => void, thisArg?: any): void;
    map<U>(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => U, thisArg?: any): U[];
    filter<S extends T>(predicate: (value: T, index: number, array: ReadonlyArray<T>) => value is S, thisArg?: any): S[];
    filter(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown, thisArg?: any): T[];
    readonly [n: number]: T;
}

interface ConcatArray<T> {
    readonly length: number;
    readonly [n: number]: T;
    join(separator?: string): string;
    slice(start?: number, end?: number): T[];
}

interface Array<T> {
    readonly length: number;
    toString(): string;
    toLocaleString(): string;
    pop(): T | undefined;
    push(...items: T[]): number;
    concat(...items: ConcatArray<T>[]): T[];
    concat(...items: (T | ConcatArray<T>)[]): T[];
    join(separator?: string): string;
    reverse(): T[];
    shift(): T | undefined;
    slice(start?: number, end?: number): T[];
    sort(compareFn?: (a: T, b: T) => number): this;
    splice(start: number, deleteCount?: number): T[];
    splice(start: number, deleteCount: number, ...items: T[]): T[];
    unshift(...items: T[]): number;
    indexOf(searchElement: T, fromIndex?: number): number;
    lastIndexOf(searchElement: T, fromIndex?: number): number;
    every(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
    some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
    filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
    filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];
    [n: number]: T;
}

interface ArrayConstructor {
    new (arrayLength?: number): any[];
    new <T>(arrayLength: number): T[];
    new <T>(...items: T[]): T[];
    (arrayLength?: number): any[];
    <T>(arrayLength: number): T[];
    <T>(...items: T[]): T[];
    readonly prototype: any[];
}

declare var Array: ArrayConstructor;
