'use strict';

/**
 * TLS configuration for the MySQL connection.
 *
 * Managed MySQL providers (Aiven, PlanetScale, Railway) present a certificate
 * signed by their own project CA rather than a public root, so Node's default
 * trust store rejects it with "self-signed certificate in certificate chain".
 * The correct fix is to supply that CA, not to stop verifying.
 *
 * Supply the CA either way:
 *   DB_CA_CERT_B64 — base64 of ca.pem. Preferred: a single line with no
 *                    newlines to be mangled by a dashboard env-var field.
 *   DB_CA_CERT     — the raw PEM. Literal "\n" sequences are converted, so a
 *                    single-line paste also works.
 */
function sslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;

  const b64 = (process.env.DB_CA_CERT_B64 || '').trim();
  const ca = b64
    ? Buffer.from(b64, 'base64').toString('utf8').trim()
    : (process.env.DB_CA_CERT || '').trim();

  if (ca) {
    return {
      ca: ca.replace(/\\n/g, '\n'),
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    };
  }

  // Encrypted but unverified: the connection is still protected from passive
  // eavesdropping, but not from an active man-in-the-middle. Acceptable only as
  // a stopgap, so it is loud about it.
  console.warn(
    '[db] DB_SSL is on but no CA certificate is set — connecting without ' +
    'certificate verification. Set DB_CA_CERT_B64 to your provider CA to fix this.'
  );
  return { rejectUnauthorized: false, minVersion: 'TLSv1.2' };
}

module.exports = { sslConfig };