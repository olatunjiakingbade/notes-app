// storage.js: reads and writes attachment files in OCI Object Storage.
// Authentication uses an OCI config file and API key mounted into the pod.
const crypto = require("crypto");
const common = require("oci-common");
const objectstorage = require("oci-objectstorage");

const NAMESPACE = process.env.OCI_NAMESPACE;
const BUCKET = process.env.OCI_BUCKET;
const REGION = process.env.OCI_REGION;

const provider = new common.ConfigFileAuthenticationDetailsProvider(
  process.env.OCI_CONFIG_FILE || "/etc/oci/config",
  process.env.OCI_PROFILE || "DEFAULT"
);

const client = new objectstorage.ObjectStorageClient({
  authenticationDetailsProvider: provider,
});
client.regionId = REGION;

// Turn "my resume.pdf" into a safe, unique object name such as
// "3f2c.../my_resume.pdf".
function makeObjectName(originalName) {
  const safe = originalName.replace(/[^\w.-]/g, "_");
  return `${crypto.randomUUID()}/${safe}`;
}

async function putObject(buffer, contentType, originalName) {
  const objectName = makeObjectName(originalName);
  await client.putObject({
    namespaceName: NAMESPACE,
    bucketName: BUCKET,
    objectName,
    putObjectBody: buffer,
    contentLength: buffer.length,
    contentType,
  });
  return objectName;
}

async function getObjectStream(objectName) {
  const response = await client.getObject({
    namespaceName: NAMESPACE,
    bucketName: BUCKET,
    objectName,
  });
  return response.value; // a readable stream
}

async function deleteObject(objectName) {
  await client.deleteObject({
    namespaceName: NAMESPACE,
    bucketName: BUCKET,
    objectName,
  });
}

module.exports = { putObject, getObjectStream, deleteObject };
