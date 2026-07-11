const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function getComposeService(compose, serviceName) {
    const match = compose.match(
        new RegExp(`^  ${serviceName}:\\r?\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:\\r?$|^volumes:|^networks:)`, "m")
    );
    assert.ok(match, `Missing ${serviceName} service`);
    return match[1];
}

async function withAppEnvironment(environment, callback) {
    const names = ["NODE_ENV", "FRONTEND_URL", "FRONTEND_URLS"];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

    for (const name of names) {
        if (Object.hasOwn(environment, name) && environment[name] !== undefined) {
            process.env[name] = environment[name];
        } else {
            delete process.env[name];
        }
    }

    delete require.cache[require.resolve("../src/app")];
    const app = require("../src/app");

    try {
        await callback(app);
    } finally {
        for (const name of names) {
            if (previous[name] === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = previous[name];
            }
        }
        delete require.cache[require.resolve("../src/app")];
    }
}

async function listenOnEphemeralPort(app) {
    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
        instance.on("error", reject);
    });

    return {
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        }),
    };
}

test("production trusts exactly one proxy hop while development keeps the Express default", async () => {
    await withAppEnvironment({ NODE_ENV: "production" }, async (app) => {
        assert.equal(app.get("trust proxy"), 1);
    });

    await withAppEnvironment({ NODE_ENV: "development" }, async (app) => {
        assert.equal(app.get("trust proxy"), false);
    });
});

test("server binds the configured host and defaults to all container interfaces", () => {
    const serverSource = read("src/server.js");
    assert.match(serverSource, /const HOST = process\.env\.HOST \|\| "0\.0\.0\.0";/);
    assert.match(serverSource, /const PORT = process\.env\.PORT \|\| 5000;/);
    assert.match(serverSource, /app\.listen\(PORT, HOST,/);
});

test("health is public and minimal, and production CORS does not add localhost", async () => {
    await withAppEnvironment({
        NODE_ENV: "production",
        FRONTEND_URL: "https://app.example.com",
        FRONTEND_URLS: "https://app.example.com, https://admin.example.com,https://app.example.com",
    }, async (app) => {
        const server = await listenOnEphemeralPort(app);
        try {
            const health = await fetch(`${server.baseUrl}/health`);
            assert.equal(health.status, 200);
            assert.deepEqual(await health.json(), { status: "ok" });

            const allowed = await fetch(`${server.baseUrl}/health`, {
                headers: { Origin: "https://app.example.com" },
            });
            assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.com");
            assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

            const localhost = await fetch(`${server.baseUrl}/health`, {
                headers: { Origin: "http://localhost:5173" },
            });
            assert.equal(localhost.status, 200);
            assert.equal(localhost.headers.get("access-control-allow-origin"), null);
        } finally {
            await server.close();
        }
    });

    await withAppEnvironment({ NODE_ENV: "development" }, async (app) => {
        const server = await listenOnEphemeralPort(app);
        try {
            const response = await fetch(`${server.baseUrl}/health`, {
                headers: { Origin: "http://localhost:5173" },
            });
            assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
        } finally {
            await server.close();
        }
    });
});

test("development CORS accepts any loopback port; production rejects non-allowlisted loopback", async () => {
    // Dev: the Vite server may land on any free port (5174, 5176, …) and report
    // itself as localhost OR 127.0.0.1 — all must be accepted so browser
    // login/signup works regardless of port.
    await withAppEnvironment({ NODE_ENV: "development" }, async (app) => {
        const server = await listenOnEphemeralPort(app);
        try {
            for (const origin of ["http://localhost:5176", "http://127.0.0.1:5174", "http://localhost:3001"]) {
                const res = await fetch(`${server.baseUrl}/health`, { headers: { Origin: origin } });
                assert.equal(res.headers.get("access-control-allow-origin"), origin, `dev should allow ${origin}`);
            }
        } finally {
            await server.close();
        }
    });

    // Production: an arbitrary loopback origin is NOT allowlisted and must be rejected.
    await withAppEnvironment({
        NODE_ENV: "production",
        FRONTEND_URL: "https://app.example.com",
    }, async (app) => {
        const server = await listenOnEphemeralPort(app);
        try {
            const res = await fetch(`${server.baseUrl}/health`, {
                headers: { Origin: "http://localhost:5176" },
            });
            assert.equal(res.headers.get("access-control-allow-origin"), null);
        } finally {
            await server.close();
        }
    });
});

test("self-hosted Compose keeps backend, worker, MongoDB, and Redis private with persistent data", () => {
    const compose = read("compose.selfhosted.yml");
    const backend = getComposeService(compose, "backend");
    const mongo = getComposeService(compose, "mongo");
    const redis = getComposeService(compose, "redis");
    const emailWorker = getComposeService(compose, "email-worker");
    const nginx = getComposeService(compose, "nginx");
    const certbot = getComposeService(compose, "certbot");

    assert.doesNotMatch(backend, /^    ports:/m);
    assert.doesNotMatch(mongo, /^    ports:/m);
    assert.doesNotMatch(redis, /^    ports:/m);
    assert.doesNotMatch(emailWorker, /^    ports:/m);
    assert.doesNotMatch(certbot, /^    ports:/m);
    assert.match(nginx, /- "8080:80"/);
    assert.match(nginx, /- "8443:443"/);

    assert.match(backend, /uploads_data:\/app\/uploads/);
    assert.match(backend, /private_storage_data:\/app\/storage/);
    assert.match(backend, /http:\/\/127\.0\.0\.1:5000\/health/);
    assert.match(mongo, /mongo_data:\/data\/db/);
    assert.match(redis, /redis_data:\/data/);
    assert.match(redis, /--appendonly yes/);
    assert.match(redis, /--maxmemory-policy noeviction/);
    assert.match(emailWorker, /npm run worker:email/);
    assert.match(emailWorker, /- private/);
    assert.match(emailWorker, /- backend_egress/);
    assert.match(backend, /- private/);
    assert.match(mongo, /- private/);
    assert.match(compose, /private:\r?\n    driver: bridge\r?\n    internal: true/);
    assert.doesNotMatch(compose, /stripe-cli/);
    assert.match(backend, /Dockerfile/);
    assert.doesNotMatch(backend, /Dockerfile\.dev|nodemon|\.\/app/);
    assert.match(certbot, /profiles:\r?\n      - tools/);
    assert.match(nginx, /default\.conf:\/etc\/nginx\/conf\.d\/default\.conf:ro/);
    assert.match(nginx, /certbot\/conf:\/etc\/letsencrypt:ro/);
});

test("MongoDB authentication and self-hosted environment examples contain placeholders only", () => {
    const environment = read(".env.selfhosted.example");
    assert.match(environment, /^MONGO_INITDB_ROOT_USERNAME=$/m);
    assert.match(environment, /^MONGO_INITDB_ROOT_PASSWORD=$/m);
    assert.match(environment, /^MONGO_INITDB_DATABASE=edu-system$/m);
    assert.match(environment, /^MONGO_URI=mongodb:\/\/USERNAME:PASSWORD@mongo:27017\/edu-system\?authSource=admin$/m);
    assert.match(environment, /^STRIPE_SECRET_KEY=$/m);
    assert.doesNotMatch(environment, /STRIPE_API_KEY/);
    assert.doesNotMatch(environment, /\b(?:sk_live|sk_test|whsec)_[A-Za-z0-9]+/);
});

for (const configPath of [
    "nginx/conf.d/default.conf",
    "nginx/conf.d/default.https.example.conf",
]) {
    test(`${configPath} forwards trusted proxy headers and scopes authentication limits`, () => {
        const config = read(configPath);
        for (const directive of [
            "proxy_set_header Host $host;",
            "proxy_set_header X-Real-IP $remote_addr;",
            "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
            "proxy_set_header X-Forwarded-Host $host;",
            "proxy_set_header X-Forwarded-Proto $scheme;",
            "proxy_set_header X-Forwarded-Port $server_port;",
            "proxy_set_header Connection \"\";",
        ]) {
            assert.ok(config.includes(directive), `Missing ${directive}`);
        }

        assert.match(config, /client_max_body_size 12m;/);
        assert.match(config, /limit_req_status 429;/);
        assert.match(config, /location = \/auth\/login/);
        assert.match(config, /location = \/auth\/otp\/resend/);
        assert.doesNotMatch(config, /location = \/health[\s{]/);
        assert.doesNotMatch(config, /location = \/stripe\/webhook[\s{]/);
        assert.match(config, /server backend:5000;/);
    });
}

test("HTTPS example uses the expected certificate and conservative TLS settings", () => {
    const config = read("nginx/conf.d/default.https.example.conf");
    assert.match(config, /fullchain\.pem;/);
    assert.match(config, /privkey\.pem;/);
    assert.match(config, /ssl_protocols TLSv1\.2 TLSv1\.3;/);
    assert.match(config, /ssl_session_tickets off;/);
    assert.match(config, /max-age=31536000/);
    assert.doesNotMatch(config, /includeSubDomains|preload/);
});

test("production image and ignore rules exclude development and secret material", () => {
    const dockerfile = read("Dockerfile");
    const dockerignore = read(".dockerignore");
    const gitignore = read(".gitignore");

    assert.match(dockerfile, /^FROM node:22-bookworm-slim$/m);
    assert.match(dockerfile, /npm ci --omit=dev/);
    assert.match(dockerfile, /COPY --chown=node:node src \.\/src/);
    assert.match(dockerfile, /^USER node$/m);
    assert.match(dockerfile, /^EXPOSE 5000$/m);
    assert.doesNotMatch(dockerfile, /Dockerfile\.dev|nodemon|COPY \./);

    for (const ignored of [".env*", "certbot", "test", "uploads", "storage"]) {
        assert.ok(dockerignore.split(/\r?\n/).includes(ignored), `Docker context should ignore ${ignored}`);
    }
    assert.match(gitignore, /^\.env\.selfhosted$/m);
    assert.match(gitignore, /^!\.env\.selfhosted\.example$/m);
    assert.match(gitignore, /^certbot\/conf\/$/m);
    assert.match(gitignore, /^certbot\/www\/$/m);
});
