// Minimal structured logger (BR-14).
//
// The codebase logs via ad-hoc console.* calls; this centralizes it so server
// output has one shape and can be silenced/redirected in one place (and later
// swapped for a real transport — pino/winston — without touching call sites).
//
// It is silent under NODE_ENV=test by default to keep test output clean; set
// LOG_IN_TEST=1 to see (or assert on) log output during tests.

function isSilenced() {
    return process.env.NODE_ENV === "test" && process.env.LOG_IN_TEST !== "1";
}

function format(level, message, meta) {
    const base = `[${level}] ${message}`;
    if (meta === undefined || meta === null) {
        return base;
    }
    try {
        return `${base} ${JSON.stringify(meta)}`;
    } catch (_error) {
        // Never let logging throw (e.g. circular meta); fall back to the message.
        return base;
    }
}

function emit(sink, level, message, meta) {
    if (isSilenced()) {
        return;
    }
    sink(format(level, message, meta));
}

const logger = {
    error: (message, meta) => emit(console.error, "error", message, meta),
    warn: (message, meta) => emit(console.warn, "warn", message, meta),
    info: (message, meta) => emit(console.log, "info", message, meta),
};

module.exports = logger;
module.exports.format = format;
