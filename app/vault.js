// vault.js: fetches a secret's value from OCI Vault. It uses the same OCI config
// and API key as storage.js. The secret's OCID is configuration, not a secret.
const common = require("oci-common");
const secrets = require("oci-secrets");

const provider = new common.ConfigFileAuthenticationDetailsProvider(
  process.env.OCI_CONFIG_FILE || "/etc/oci/config",
  process.env.OCI_PROFILE || "DEFAULT"
);

const client = new secrets.SecretsClient({
  authenticationDetailsProvider: provider,
});
client.regionId = process.env.OCI_REGION;

// Returns the plain-text value of the secret with this OCID.
// Vault returns secret contents base64-encoded, so decode them here.
async function getSecretValue(secretId) {
  const response = await client.getSecretBundle({ secretId });
  const base64 = response.secretBundle.secretBundleContent.content;
  return Buffer.from(base64, "base64").toString("utf8");
}

module.exports = { getSecretValue };
