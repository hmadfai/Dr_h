import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

function hex(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

if (!fs.existsSync(envPath)) {
  const contents = `DATABASE_URL="file:./dev.db"
ENCRYPTION_KEY="${hex()}"
HMAC_KEY="${hex()}"
AUTH_SECRET="${hex()}"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="Training in Data CRM <crm@trainingindata.com>"
`;
  fs.writeFileSync(envPath, contents);
  console.log("Wrote", envPath);
} else {
  console.log("Using existing", envPath);
}

const opts = { cwd: root, stdio: "inherit" as const };
execSync("npx prisma generate", opts);
execSync("npx prisma db push", opts);
execSync("npx tsx prisma/seed.ts", opts);
console.log("CRM database is ready.");
