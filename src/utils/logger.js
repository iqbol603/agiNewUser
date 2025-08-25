const ts = () => new Date().toISOString();

export const log = {
    info: (...a) => console.log(`[INFO] ${ts()}`, ...a),
    warn: (...a) => console.warn(`[WARN] ${ts()}`, ...a),
    error: (...a) => console.error(`[ERROR] ${ts()}`, ...a),
    debug: (...a) => console.debug(`[DEBUG] ${ts()}`, ...a)
};