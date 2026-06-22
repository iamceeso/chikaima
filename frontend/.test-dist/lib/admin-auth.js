"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBasicAuthHeader = buildBasicAuthHeader;
const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let encoded = "";
    for (let index = 0; index < bytes.length; index += 3) {
        const firstByte = bytes[index] ?? 0;
        const hasSecondByte = index + 1 < bytes.length;
        const hasThirdByte = index + 2 < bytes.length;
        const secondByte = hasSecondByte ? (bytes[index + 1] ?? 0) : 0;
        const thirdByte = hasThirdByte ? (bytes[index + 2] ?? 0) : 0;
        encoded += base64Alphabet[firstByte >> 2];
        encoded += base64Alphabet[((firstByte & 0x03) << 4) | (secondByte >> 4)];
        encoded += hasSecondByte ? base64Alphabet[((secondByte & 0x0f) << 2) | (thirdByte >> 6)] : "=";
        encoded += hasThirdByte ? base64Alphabet[thirdByte & 0x3f] : "=";
    }
    return encoded;
}
function buildBasicAuthHeader(email, password) {
    const credentials = `${email.trim()}:${password}`;
    return `Basic ${encodeBase64Utf8(credentials)}`;
}
