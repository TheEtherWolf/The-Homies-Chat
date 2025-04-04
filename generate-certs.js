const fs = require('fs');
const crypto = require('crypto');

// Generate private key
const private_key = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048
});

// Create certificate request
const csr = crypto.createSign('sha256');
csr.update('');
csr.end();

// Create self-signed certificate
const cert = crypto.createSign('sha256');
cert.update('');
cert.end();

// Write files
fs.writeFileSync('server.key', private_key.privateKey.export({
  type: 'pkcs1',
  format: 'pem'
}));

fs.writeFileSync('server.cert', cert.sign(private_key.privateKey));

console.log('SSL certificates generated successfully!');
